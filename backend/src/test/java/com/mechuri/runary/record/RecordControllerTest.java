package com.mechuri.runary.record;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;
import com.mechuri.runary.account.AppleTokenVerifier;
import com.mechuri.runary.account.KakaoTokenVerifier;

// 로그인 FRD §5-1 첫 가입 시 일괄 업로드, §5-4 같은 기록은 한 건만, §5-5 올리는 것만 저장
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:records;DB_CLOSE_DELAY=-1",
        "app.jwt-secret=dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ="
})
@AutoConfigureMockMvc
class RecordControllerTest {

    private static final String RECORD = """
            {"startedAt":1763600000,"endedAt":1763601800,"durationSeconds":1700,"distanceMeters":5230,
             "averagePaceSecPerKm":325,"averageHeartRate":152,"maxHeartRate":171,"steps":5100,"averageCadence":172,
             "points":[{"latitude":37.5,"longitude":127.0,"time":1763600001,"segment":0}],
             "heartRates":[{"time":1763600060,"bpm":140}],
             "batteryStart":0.9,"errors":["gps gap"]}
            """;

    @Autowired MockMvc mvc;
    @Autowired RunRecordRepository records;
    @MockitoBean AppleTokenVerifier apple;
    @MockitoBean KakaoTokenVerifier kakao;

    private String login(String appleUserId) throws Exception {
        given(apple.verify(appleUserId)).willReturn(appleUserId);
        String body = mvc.perform(post("/auth/apple").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identityToken\":\"" + appleUserId + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    private ResultActions upload(String token, String recordId) throws Exception {
        return mvc.perform(put("/me/records/" + recordId).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(RECORD));
    }

    // 우리 토큰의 sub가 계정 ID다
    private long countOf(String token) {
        String claims = new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]));
        return records.countByAccountId(Long.valueOf(JsonPath.<String>read(claims, "$.sub")));
    }

    @Test
    void 같은_기록을_여러_번_올려도_한_건만_남는다() throws Exception {
        String token = login("records-1");
        upload(token, "run-a").andExpect(status().isNoContent());
        upload(token, "run-a").andExpect(status().isNoContent());
        upload(token, "run-b").andExpect(status().isNoContent());
        assertThat(countOf(token)).isEqualTo(2);
    }

    @Test
    void 계정마다_따로_보관한다() throws Exception {
        String a = login("records-2");
        String b = login("records-3");
        upload(a, "shared-id").andExpect(status().isNoContent());
        assertThat(countOf(b)).isZero();
    }

    @Test
    void 진단_정보는_저장하지_않는다() throws Exception {
        String token = login("records-4");
        upload(token, "run-c").andExpect(status().isNoContent());
        String payload = records.findAll().stream().map(RunRecord::getPayload).filter(p -> p.contains("5230")).findFirst().orElseThrow();
        assertThat(payload).contains("\"points\"", "\"heartRates\"").doesNotContain("batteryStart", "gps gap");
    }

    @Test
    void 토큰_없이는_올릴_수_없다() throws Exception {
        mvc.perform(put("/me/records/x").contentType(MediaType.APPLICATION_JSON).content(RECORD))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 내_정보를_조회하면_새_토큰을_준다() throws Exception {
        String token = login("records-5");
        mvc.perform(get("/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString());
    }
}
