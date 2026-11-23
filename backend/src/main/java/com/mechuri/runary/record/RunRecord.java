package com.mechuri.runary.record;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** 백업한 Runary 측정 기록 한 건(로그인 FRD §5). 계정 + 기록 ID가 같으면 한 건만 남는다(§5-4). */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"accountId", "recordId"}))
class RunRecord {

    @Id
    @GeneratedValue
    private Long id;

    @Column(nullable = false)
    private Long accountId;

    // 앱의 측정 기록 ID. 복원할 때 기기에 이미 있는 기록을 건너뛰는 기준이다(§5-3)
    @Column(nullable = false, length = 100)
    private String recordId;

    // FRD §5-5 올리는 것만 담은 JSON(RecordUpload). 서버는 내용을 해석하지 않고 보관만 한다
    @Lob
    @Column(nullable = false)
    private String payload;

    @Column(nullable = false)
    private Instant uploadedAt;

    protected RunRecord() {
    }

    RunRecord(Long accountId, String recordId, String payload) {
        this.accountId = accountId;
        this.recordId = recordId;
        update(payload);
    }

    void update(String payload) {
        this.payload = payload;
        this.uploadedAt = Instant.now();
    }

    String getPayload() { return payload; }
}
