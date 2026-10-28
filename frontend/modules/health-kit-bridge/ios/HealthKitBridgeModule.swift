import CoreLocation
import ExpoModulesCore
import HealthKit

// FRD: docs/specs/frd/run-record-selection.md

struct RunRecordPayload: Record {
  @Field var id: String = ""
  @Field var runaryRunID: String?
  @Field var date: String = ""
  @Field var distanceMeters: Double = 0
  @Field var durationSeconds: Double = 0
  @Field var averagePaceSecPerKm: Double = 0
  @Field var averageHeartRate: Double?
  // §2-2: 좌표 없는 워크아웃은 목록에서 빼고 집계로 알린다.
  @Field var hasRoute: Bool = false
}

struct CoordinatePayload: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
  @Field var timestamp: String = ""
  @Field var segment: Int = 0
}

struct TrackPayload: Record {
  @Field var coordinates: [CoordinatePayload] = []
}

enum HealthKitBridgeError: Error, LocalizedError {
  case notAvailable
  case workoutNotFound

  var errorDescription: String? {
    switch self {
    case .notAvailable:
      return "이 기기에서 HealthKit을 쓸 수 없습니다"
    case .workoutNotFound:
      return "해당 워크아웃을 찾을 수 없습니다"
    }
  }
}

public class HealthKitBridgeModule: Module {
  private let healthStore = HKHealthStore()
  @MainActor private var authorizationTask: Task<Bool, Error>?

  public func definition() -> ModuleDefinition {
    Name("HealthKitBridge")

    // 공통 규칙 §1-3: 목록을 열 때 아직 응답하지 않은 항목만 요청한다.
    AsyncFunction("requestAuthorization") { () async throws -> Bool in
      try await self.ensureAuthorization()
    }

    // §2-1: 실외 달리기만. §2-3: 목록 항목(날짜·거리·시간·페이스·심박).
    // §2-4: 정렬은 최신순, 범위 제한 없음(정렬은 여기서, 범위 제한은 애초에 안 함).
    AsyncFunction("getOutdoorRuns") { () async throws -> [RunRecordPayload] in
      let outdoorWorkouts = try await self.fetchOutdoorRunWorkouts()

      // 2026-10-28: 평균 심박·경로 유무는 한 번 조회한 기록이면 보관한 값을 쓴다
      // (HealthRecordCache.swift, FRD runary-record-editing §목록). 목록 자체는 위처럼
      // 매번 건강 앱에서 새로 읽으므로 지운 기록은 바로 사라진다. 보관 정보는 메모일 뿐이다.
      let now = Date()
      let cacheURL = try? HealthRecordCacheStore.defaultURL()
      let cache = cacheURL.map { HealthRecordCacheStore.load(from: $0) } ?? HealthRecordCache()

      // 실기기 피드백(2026-09): 워크아웃 수만큼 심박·경로 유무 쿼리를 for-await로
      // 하나씩 직렬로 기다렸더니, 기록이 많을수록(왕복 시간 × 워크아웃 수 × 2) 목록
      // 진입 자체가 눈에 띄게 느렸다. 워크아웃마다·쿼리마다 서로 독립적이라 전부
      // 병렬로 실행하고, 완료 순서가 뒤섞이므로 인덱스로 원래(최신순) 정렬을 되살린다.
      let indexed = try await withThrowingTaskGroup(of: (Int, RunRecordPayload, Bool).self) { group in
        for (index, workout) in outdoorWorkouts.enumerated() {
          group.addTask {
            var payload = RunRecordPayload()
            payload.id = workout.uuid.uuidString
            if workout.sourceRevision.source.bundleIdentifier == Bundle.main.bundleIdentifier {
              payload.runaryRunID = workout.metadata?["com.mechuri.runary.runID"] as? String
            }
            payload.date = ISO8601DateFormatter().string(from: workout.startDate)
            payload.distanceMeters = workout.totalDistance?.doubleValue(for: .meter()) ?? 0
            payload.durationSeconds = workout.duration
            payload.averagePaceSecPerKm = payload.distanceMeters > 0
              ? payload.durationSeconds / (payload.distanceMeters / 1000)
              : 0
            if let cached = cache.extras(for: payload.id, end: workout.endDate, now: now) {
              payload.averageHeartRate = cached.averageHeartRate
              payload.hasRoute = cached.hasRoute
              return (index, payload, false)
            }
            async let heartRate = self.averageHeartRate(for: workout)
            async let hasRoute = self.hasWorkoutRoute(workout)
            payload.averageHeartRate = try await heartRate
            payload.hasRoute = try await hasRoute
            return (index, payload, true)
          }
        }
        var collected: [(Int, RunRecordPayload, Bool)] = []
        for try await result in group {
          collected.append(result)
        }
        return collected
      }

      // 새로 조회한 기록을 보관하고, 건강 앱에서 사라진 기록은 보관 정보에서도 지운다.
      // 보관 실패는 목록에 영향을 주지 않는다. 다음에 다시 조회하면 된다.
      if let cacheURL {
        var updated = cache
        var changed = updated.prune(keeping: Set(outdoorWorkouts.map { $0.uuid.uuidString }))
        for (index, payload, fresh) in indexed where fresh {
          let workout = outdoorWorkouts[index]
          if updated.store(HealthRecordExtras(averageHeartRate: payload.averageHeartRate, hasRoute: payload.hasRoute),
                           for: payload.id, end: workout.endDate, now: now) { changed = true }
        }
        if changed { try? HealthRecordCacheStore.save(updated, to: cacheURL) }
      }

      // 최신순 정렬 (startDate 내림차순은 쿼리 단계에서 이미 적용됨) — 병렬 완료 순서와
      // 무관하게 원래 순서를 되살린다.
      return indexed.sorted { $0.0 < $1.0 }.map { $0.1 }
    }

    // §5: 고른 다음 트랙 좌표를 앱이 복사해 보관한다. 여기서 실제 좌표를 가져온다.
    AsyncFunction("getRoute") { (workoutId: String) async throws -> TrackPayload in
      guard let workout = try await self.findWorkout(byId: workoutId) else {
        throw HealthKitBridgeError.workoutNotFound
      }

      let routes = try await self.fetchRoutes(for: workout)
      var payload = TrackPayload()
      for (segment, route) in routes.sorted(by: { $0.startDate < $1.startDate }).enumerated() {
        let locations = try await self.fetchLocations(for: route)
        payload.coordinates += locations.map { location in
          var coord = CoordinatePayload()
          coord.latitude = location.coordinate.latitude
          coord.longitude = location.coordinate.longitude
          coord.timestamp = ISO8601DateFormatter().string(from: location.timestamp)
          coord.segment = segment
          return coord
        }
      }
      return payload
    }
  }

  @MainActor private func ensureAuthorization() async throws -> Bool {
    if let authorizationTask { return try await authorizationTask.value }
    let store = healthStore
    let task = Task<Bool, Error> {
      guard HKHealthStore.isHealthDataAvailable() else {
        throw HealthKitBridgeError.notAvailable
      }

      let readTypes: Set<HKObjectType> = [
        HKObjectType.workoutType(),
        HKSeriesType.workoutRoute(),
        HKObjectType.quantityType(forIdentifier: .heartRate)!
      ]

      return try await withCheckedThrowingContinuation { continuation in
        store.getRequestStatusForAuthorization(toShare: [], read: readTypes) { status, error in
          if let error { continuation.resume(throwing: error); return }
          // Unnecessary means the user has answered, including refusal. It does
          // not reveal read permission. Always proceed to the data query.
          if status == .unnecessary { continuation.resume(returning: true); return }
          guard status == .shouldRequest else {
            continuation.resume(throwing: NSError(domain: "HealthKitBridge", code: 1,
              userInfo: [NSLocalizedDescriptionKey: "건강 데이터 권한 요청 상태를 확인하지 못했어요."])); return
          }
          store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error { continuation.resume(throwing: error) }
            else { continuation.resume(returning: success) }
          }
        }
      }
    }
    authorizationTask = task
    defer { authorizationTask = nil }
    return try await task.value
  }

  // MARK: - 내부 쿼리 헬퍼

  private func fetchOutdoorRunWorkouts() async throws -> [HKWorkout] {
    let predicate = HKQuery.predicateForWorkouts(with: .running)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

    let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
      let query = HKSampleQuery(
        sampleType: HKObjectType.workoutType(),
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error = error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
        }
      }
      self.healthStore.execute(query)
    }

    // 실내 러닝 제외 (§2-1). 실내는 metadata에 표시되고, 대체로 경로 자체가 없다.
    return workouts.filter { workout in
      let isIndoor = workout.metadata?[HKMetadataKeyIndoorWorkout] as? Bool ?? false
      return !isIndoor
    }
  }

  private func hasWorkoutRoute(_ workout: HKWorkout) async throws -> Bool {
    let routes = try await fetchRoutes(for: workout)
    return !routes.isEmpty
  }

  private func fetchRoutes(for workout: HKWorkout) async throws -> [HKWorkoutRoute] {
    let predicate = HKQuery.predicateForObjects(from: workout)
    let routes: [HKWorkoutRoute] = try await withCheckedThrowingContinuation { continuation in
      let query = HKAnchoredObjectQuery(
        type: HKSeriesType.workoutRoute(),
        predicate: predicate,
        anchor: nil,
        limit: HKObjectQueryNoLimit
      ) { _, samples, _, _, error in
        if let error = error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: (samples as? [HKWorkoutRoute]) ?? [])
        }
      }
      self.healthStore.execute(query)
    }
    return routes
  }

  private func fetchLocations(for route: HKWorkoutRoute) async throws -> [CLLocation] {
    var allLocations: [CLLocation] = []
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      let routeQuery = HKWorkoutRouteQuery(route: route) { _, locationsOrNil, done, errorOrNil in
        if let error = errorOrNil {
          continuation.resume(throwing: error)
          return
        }
        if let locations = locationsOrNil {
          allLocations.append(contentsOf: locations)
        }
        if done {
          continuation.resume()
        }
      }
      self.healthStore.execute(routeQuery)
    }
    return allLocations
  }

  private func averageHeartRate(for workout: HKWorkout) async throws -> Double? {
    guard let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
      return nil
    }
    let predicate = HKQuery.predicateForObjects(from: workout)
    return try await withCheckedThrowingContinuation { continuation in
      let query = HKStatisticsQuery(
        quantityType: heartRateType,
        quantitySamplePredicate: predicate,
        options: .discreteAverage
      ) { _, statistics, error in
        // §2-3: 심박은 있을 수도 없을 수도 있다. HKStatisticsQuery는 해당 워크아웃에
        // 심박 샘플이 하나도 없으면 "정상적으로 nil을 준다"가 아니라 errorNoData를
        // 던진다 — 이건 에러가 아니라 "심박 없음"의 정상 케이스이므로 nil로 흡수한다.
        let nsError = error as NSError?
        if nsError?.domain == HKErrorDomain, nsError?.code == HKError.errorNoData.rawValue {
          continuation.resume(returning: nil)
          return
        }
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        let unit = HKUnit.count().unitDivided(by: .minute())
        continuation.resume(returning: statistics?.averageQuantity()?.doubleValue(for: unit))
      }
      self.healthStore.execute(query)
    }
  }

  private func findWorkout(byId id: String) async throws -> HKWorkout? {
    let workouts = try await fetchOutdoorRunWorkouts()
    return workouts.first { $0.uuid.uuidString == id }
  }
}
