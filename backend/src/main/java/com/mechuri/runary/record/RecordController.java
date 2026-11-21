package com.mechuri.runary.record;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.ObjectMapper;

/** 로그인 FRD §5-1 첫 가입 시 일괄 업로드, §5-4 실패와 재시도. */
@RestController
class RecordController {

    private final RunRecordRepository records;
    private final ObjectMapper json;

    RecordController(RunRecordRepository records, ObjectMapper json) {
        this.records = records;
        this.json = json;
    }

    /** 같은 기록을 여러 번 올려도 한 건만 남는다. 앱은 실패하면 그대로 다시 보내면 된다. */
    @PutMapping("/me/records/{recordId}")
    ResponseEntity<Void> upload(@AuthenticationPrincipal Jwt jwt, @PathVariable String recordId, @RequestBody RecordUpload upload) {
        if (recordId.isBlank() || recordId.length() > 100 || upload.points() == null) {
            return ResponseEntity.badRequest().build();
        }
        Long accountId = Long.valueOf(jwt.getSubject());
        String payload = json.writeValueAsString(upload);
        RunRecord record = records.findByAccountIdAndRecordId(accountId, recordId)
                .orElseGet(() -> new RunRecord(accountId, recordId, payload));
        record.update(payload);
        try {
            records.saveAndFlush(record);
        } catch (DataIntegrityViolationException e) {
            // 같은 기록을 동시에 두 번 올렸다. 먼저 들어간 것이 남아 있으니 성공으로 본다
        }
        return ResponseEntity.noContent().build();
    }
}
