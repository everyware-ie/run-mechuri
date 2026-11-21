package com.mechuri.runary.record;

import java.util.List;

/**
 * 로그인 FRD §5-5 올리는 것. 여기 없는 필드(배터리, GPS 공백 같은 진단 정보)는 받아도 버린다.
 * 시각은 모두 Unix 초.
 */
record RecordUpload(
        double startedAt,
        double endedAt,
        double durationSeconds,
        double distanceMeters,
        Double averagePaceSecPerKm,
        Double averageHeartRate,
        Double maxHeartRate,
        Integer steps,
        Double averageCadence,
        List<Point> points,
        List<Heart> heartRates) {

    record Point(double latitude, double longitude, double time, int segment) {}

    record Heart(double time, double bpm) {}
}
