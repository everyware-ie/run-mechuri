package com.mechuri.runary.record;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface RunRecordRepository extends JpaRepository<RunRecord, Long> {
    Optional<RunRecord> findByAccountIdAndRecordId(Long accountId, String recordId);
    long countByAccountId(Long accountId);
}
