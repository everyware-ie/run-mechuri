package com.mechuri.runary.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;
import com.mechuri.runary.record.RunRecordRepository;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;

// 로그인 FRD §7 탈퇴
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:withdraw;DB_CLOSE_DELAY=-1",
        "app.jwt-secret=dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ="
})
@AutoConfigureMockMvc
class WithdrawTest {

    @Autowired MockMvc mvc;
    @Autowired RunRecordRepository records;
    @MockitoBean AppleTokenVerifier apple;
    @MockitoBean KakaoTokenVerifier kakao;
    @MockitoBean AppleTokenRevoker revoker;

    private String signUp(String appleUserId, String nickname) throws Exception {
        given(apple.verify(appleUserId)).willReturn(appleUserId);
        String body = mvc.perform(post("/auth/apple").contentType(MediaType.APPLICATION_JSON)
                .content("{\"identityToken\":\"" + appleUserId + "\"}")).andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(body, "$.token");
        mvc.perform(put("/me/nickname").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"" + nickname + "\"}")).andExpect(status().isOk());
        mvc.perform(put("/me/records/run-1").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"startedAt\":1,\"endedAt\":2,\"durationSeconds\":1,\"distanceMeters\":1,\"points\":[]}"))
                .andExpect(status().isNoContent());
        return token;
    }

    private long accountId(String token) {
        return Long.parseLong(JsonPath.read(new String(Base64.getUrlDecoder().decode(token.split("\\.")[1])), "$.sub"));
    }

    @Test
    void 탈퇴하면_계정과_기록이_지워지고_같은_Apple_계정은_새로_가입한다() throws Exception {
        String token = signUp("withdraw-1", "탈퇴러너");
        long id = accountId(token);

        mvc.perform(delete("/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"appleAuthorizationCode\":\"code-1\"}")).andExpect(status().isNoContent());

        verify(revoker).revoke("code-1");
        assertThat(records.countByAccountId(id)).isZero();
        mvc.perform(get("/me").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        // 닉네임도 지워져 다른 사람이 쓸 수 있고, 같은 Apple 계정으로 로그인하면 가입 미완료로 시작한다
        mvc.perform(post("/auth/apple").contentType(MediaType.APPLICATION_JSON).content("{\"identityToken\":\"withdraw-1\"}"))
                .andExpect(jsonPath("$.nickname").doesNotExist());
        signUp("withdraw-2", "탈퇴러너");
    }

    @Test
    void Apple_토큰_해지가_실패해도_계정은_지운다() throws Exception {
        String token = signUp("withdraw-3", "해지실패");
        willThrow(new RuntimeException("apple down")).given(revoker).revoke(anyString());
        mvc.perform(delete("/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"appleAuthorizationCode\":\"code-2\"}")).andExpect(status().isNoContent());
        mvc.perform(get("/me").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
    }

    @Test
    void code가_없으면_해지_없이_지운다() throws Exception {
        String token = signUp("withdraw-4", "코드없음");
        mvc.perform(delete("/me").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        verify(revoker, never()).revoke(anyString());
    }

    @Test
    void Apple_client_secret은_p8_키로_서명한_ES256_JWT다() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        var pair = gen.generateKeyPair();
        Instant now = Instant.parse("2026-11-23T00:00:00Z");

        SignedJWT jwt = SignedJWT.parse(AppleTokenRevoker.clientSecret((ECPrivateKey) pair.getPrivate(), "TEAM", "KEY", "com.mechuri.runmechuri", now));

        assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey) pair.getPublic()))).isTrue();
        assertThat(jwt.getHeader().getKeyID()).isEqualTo("KEY");
        assertThat(jwt.getJWTClaimsSet().getIssuer()).isEqualTo("TEAM");
        assertThat(jwt.getJWTClaimsSet().getSubject()).isEqualTo("com.mechuri.runmechuri");
        assertThat(jwt.getJWTClaimsSet().getAudience()).containsExactly("https://appleid.apple.com");
        assertThat(jwt.getJWTClaimsSet().getExpirationTime().toInstant()).isEqualTo(now.plusSeconds(300));
    }
}
