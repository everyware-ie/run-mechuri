package com.mechuri.runary.record;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface RunRecordRepository extends JpaRepository<RunRecord, Long> {
    Optional<RunRecord> findByAccountIdAndRecordId(Long accountId, String recordId);
    long countByAccountId(Long accountId);

    /** 탈퇴할 때 그 계정의 백업 기록을 모두 지운다(로그인 FRD §7-2) */
    @Modifying
    @Query("delete from RunRecord r where r.accountId = :accountId")
    void deleteByAccountId(Long accountId);
}
