# GPU 프레임 변환 실험 보고서

2026-09-28 · 전경 실험 완료, 변환 단독 방식 미채택

근거: [내보내기·공유 FRD](../../specs/frd/export-and-share.md) §2-5 앱 전환·화면 잠금 중 인코딩, [경로 렌더링 FRD](../../specs/frd/route-rendering.md) §9 출력 규격. 사용자가 다음 후보 실험과 보고서 작성을 승인했다.

이번 단계는 경로·러닝 데이터를 그리는 UIKit 방식과 내부 배율 3을 유지하고, 고해상도 프레임의 축소·영상 버퍼 변환만 Metal 기반 Core Image로 옮긴다. 전체 경로·글로우 GPU 렌더러 구현과는 구분한다. 병렬 처리와 고정 요소 캐시는 사용하지 않는다.

[Apple CIContext 문서](https://developer.apple.com/documentation/coreimage/cicontext)는 CVPixelBuffer로 직접 렌더링하는 API를 제공한다. 컨텍스트는 영상 한 편 동안 재사용하고 출력용 BGRA·IOSurface 버퍼를 사용한다. GPU 완료 후 writer에 넘긴다. 축소는 Lanczos 필터로 실험하며 기존 Core Graphics 보간과 같다고 가정하지 않는다.

[Apple 백그라운드 작업 안내](https://developer.apple.com/documentation/BackgroundTasks/performing-long-running-tasks-on-ios-and-ipados)에 따라 백그라운드 GPU는 지원 여부 확인과 별도 entitlement가 필요하다. 이번 로컬 빌드는 그 권한을 추가하지 않는다. 전경 실험이며 잠금 중 GPU 실행이 검증됐다고 보고하지 않는다.

## 결과

iPhone 11 Pro / iOS 26.6.2, 동일 Release 바이너리의 CPU 1회 → GPU 1회 비교다. 전경·미러링 종료, 저전력 모드 꺼짐, 각 시작·종료 thermalState는 0(nominal)이었다. 기존과 같은 1,000점 합성 경로·4032×3024 합성 JPEG·불빛 러너·글래스·동적 숫자·한글 문구다. 개인정보를 포함한 입력은 쓰지 않았다.

| 항목 | 기존 CPU 변환 | GPU 변환 |
|---|---:|---:|
| 네이티브 전체 | 42.9909초 | 49.7983초 |
| 프레임 그리기 | 30.085초 | 30.764초 |
| 축소·버퍼 변환 | 11.805초 | 16.607초 |
| writer 대기 | 0.371초 | 0.362초 |
| 최대 resident | 366.2MiB | 360.0MiB |
| 종료 시 footprint | 136.7MiB | 162.9MiB |

이번 한 쌍에서는 전체가 6.8074초(15.8%) 늘었고, 개선 대상인 변환 구간도 4.802초 늘었다. CPU에서 만든 3240×5760 이미지를 매번 GPU 입력으로 넘기고 Lanczos 축소와 색상·버퍼 처리를 수행하는 비용이 추가되었다. 어느 단계가 몇 초를 차지하는지는 분해하지 않았으므로 전부 전송 비용이라고 단정하지 않는다. 반복 1쌍의 탐색 결과이며 일반적인 GPU 성능의 결론이 아니다.

Metal 장치는 `Apple A13 GPU`로 확인했다. 기본 CPU 경로는 ARGB, GPU 경로는 BGRA·IOSurface·Metal 호환 출력 버퍼를 썼다. GPU는 sRGB 작업·출력 색공간과 Lanczos 축소를 사용했다. 내부 그리기 해상도와 인코더 규격은 유지했지만 변환 경로 자체가 달라 픽셀 동일성을 별도로 검사했다.

### 화질 및 출력 확인

두 영상의 10초 프레임을 추출해 확인했으며 상하 뒤집힘·검은 화면·텍스트 누락은 보이지 않았다. 한 장의 화면 확인만으로 전체 화질 동등성을 선언하지 않는다. 전체 프레임 비교 결과는 검증 항목에 기록한다.

### 백그라운드 제약

현재 앱 구성에서 `BGTaskScheduler.supportedResources.contains(.gpu)`는 false였다. 이 빌드는 Background GPU Access entitlement를 넣지 않은 상태이므로 이를 해당 아이폰 하드웨어가 영구적으로 GPU 백그라운드를 지원하지 않는다는 뜻으로 해석하지 않는다. 실제 권한·지원 기기·작업 요청을 갖춘 상태에서 별도 검증이 필요하다. 이번에는 화면 잠금 GPU 실행을 시도하지 않았다.

### 판단

**이번 GPU 축소·변환 단독 방식은 미채택한다.** 속도 이득이 없으므로 반복 확대·병렬 결합·제품 기본 적용을 중단한다. 전체 GPU 렌더러를 구현해 실패한 것이 아니며, 경로·글로우를 처음부터 GPU에서 그리는 구조는 아직 실험하지 않았다. 네이티브 단독 측정에는 JS 요청 전달·보관함 등록이 포함되지 않는다.

## 구현과 재현

[GPU 실험 소스 생성기](../../../frontend/scripts/export-gpu-conversion-experiment.py)는 [기존 비교 소스 생성기](../../../frontend/scripts/export-frame-parallel-experiment.py)의 출력을 읽어 별도 임시 소스를 만든다. 기존 제품 모듈 → 비교 소스 생성기 → GPU 생성기 순서로 실행한다. [측정 진입 절차](export-preparation.md)에 따라 로컬 빌드를 만들고 두 제품 소스는 즉시 복원한다.

`--export-preparation-benchmark`만 주면 CPU 기준선, `--gpu-conversion`을 추가하면 이번 후보를 실행한다. 병렬 실행 인자와의 결합은 거부한다. CIContext는 작업별로 생성·해제하며 생성 비용은 `nativeTotal`에 포함한다. GPU 장치를 만들지 못하면 실패하고 CPU 성공으로 위장하지 않는다.

[Apple WWDC 2017 Core Image 자료](https://devstreaming-cdn.apple.com/videos/wwdc/2017/510lf4jlju5s1/510/510_advances_in_core_image_filters_metal_vision_and_more.pdf?dl=1)는 기존 CVPixelBuffer 렌더 API가 렌더 완료 후 반환한다고 설명한다. 이 동기 API 반환 이후에만 writer에 버퍼를 넣는다.

원본 로그·영상·프레임은 측정 Mac의 `/private/tmp/runary-gpu-control*`, `/private/tmp/runary-gpu-trial*`, `/private/tmp/runary-gpu-pixels.log`에 있다. 임시 경로이므로 위 조건과 수치를 보고서에 남긴다.

## 검증

- 실험 Swift 코드의 iOS Release 빌드 성공. 제품 모듈과 AppDelegate 복원 완료.
- 전경 CPU/GPU 비교 측정 및 10초 프레임 시각 확인 완료.
- 두 영상 모두 1080×1920·30fps·12초·360프레임이며 프레임 시각이 일치했다. 출력 규격 검사를 통과했다.
- 디코딩한 360프레임 모두 픽셀 차이가 있었다. 평균 절대 채널 차이는 0.856180872/255, 최대 차이는 99/255로 엄격한 픽셀 일치 검사는 실패했다. 보간·색상 변환 경로가 다르며, 이 수치만으로 품질 저하나 동등성을 단정하지 않는다.
- 잠금·다른 앱 전환·취소·메모리 경고·다른 프리셋과 사진은 미검증이다. 미채택 후보라 제품 검증으로 확대하지 않는다.

## 이 실험의 범위와 남은 후보

이것이 마지막 후보는 아니다. 복사·축소를 전부 없앤다고 가정해도 이전 측정의 약 31초 프레임 그리기는 남는다. 이번 단계만으로 10초 이내를 기대하는 것은 맞지 않는다. 먼저 GPU 변환 경로의 실제 비용과 화질 변화를 확인하는 실험이다.

그 뒤에는 경로·글로우 자체를 GPU에서 그리는 구조, CPU 버퍼를 직접 재사용하며 중간 이미지를 줄이는 구조, 검증된 개선과 제한된 병렬 처리의 결합이 남는다. 내부 배율 변경도 기술적 후보지만 작은 글자와 선 품질 검증이 필요하므로 기본적인 화질 유지 해법으로 간주하지 않는다. 각 후보는 이득과 구현·안정성 비용으로 선택하며 모두 순서대로 구현하는 것을 목표로 삼지 않는다.

설치 직후 잠금으로 차단된 첫 실행은 측정에서 제외했다. 잠금 해제 후 위 두 실행이 정상 완료됐으며 측정 후 일반 앱 화면으로 돌아갔다.
