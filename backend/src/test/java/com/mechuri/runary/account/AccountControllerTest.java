package com.mechuri.runary.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

// Apple·카카오 검증은 외부 호출이라 대역으로 바꾸고, 우리 서버의 가입·로그인·닉네임 규칙을 확인한다
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:test;DB_CLOSE_DELAY=-1",
        "app.jwt-secret=dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ="
})
@AutoConfigureMockMvc
class AccountControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean AppleTokenVerifier apple;
    @MockitoBean KakaoTokenVerifier kakao;

    private String appleLogin(String appleUserId) throws Exception {
        given(apple.verify("token-" + appleUserId)).willReturn(appleUserId);
        String body = mvc.perform(post("/auth/apple").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identityToken\":\"token-" + appleUserId + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    private org.springframework.test.web.servlet.ResultActions setNickname(String token, String nickname) throws Exception {
        return mvc.perform(put("/me/nickname").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"" + nickname + "\"}"));
    }

    @Test
    void 첫_로그인은_닉네임_없는_가입_미완료이고_다시_로그인하면_같은_계정() throws Exception {
        String first = appleLogin("apple-1");
        mvc.perform(get("/me").header("Authorization", "Bearer " + first))
                .andExpect(jsonPath("$.nickname").doesNotExist())
                .andExpect(jsonPath("$.provider").value("APPLE"));

        setNickname(first, "새벽러너").andExpect(status().isOk());

        given(apple.verify("again")).willReturn("apple-1");
        mvc.perform(post("/auth/apple").contentType(MediaType.APPLICATION_JSON).content("{\"identityToken\":\"again\"}"))
                .andExpect(jsonPath("$.nickname").value("새벽러너"));
    }

    @Test
    void 같은_사용자_ID라도_로그인_수단이_다르면_다른_계정() throws Exception {
        appleLogin("same-id");
        given(kakao.verify("k")).willReturn("same-id");
        mvc.perform(post("/auth/kakao").contentType(MediaType.APPLICATION_JSON).content("{\"accessToken\":\"k\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").doesNotExist());
    }

    @Test
    void 닉네임은_앞뒤_공백을_지우고_영문을_소문자로_저장() throws Exception {
        setNickname(appleLogin("apple-2"), "  RunNer1 ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("runner1"));
    }

    @Test
    void 규칙에_맞지_않는_닉네임은_400() throws Exception {
        String token = appleLogin("apple-3");
        setNickname(token, "a").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_LENGTH"));
        setNickname(token, "abcdefghijk").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_LENGTH"));
        setNickname(token, "새벽 러너").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CHARS"));
        setNickname(token, "러너!").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CHARS"));
        setNickname(token, "ㄱㄴㄷ").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CHARS"));
    }

    @Test
    void 다른_사람이_쓰는_닉네임은_대소문자가_달라도_409_내_닉네임은_다시_저장_가능() throws Exception {
        String a = appleLogin("apple-4");
        setNickname(a, "nightrun").andExpect(status().isOk());
        setNickname(appleLogin("apple-5"), "NightRun").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE"));
        setNickname(a, "nightrun").andExpect(status().isOk());
    }

    @Test
    void 토큰_없이는_401_잘못된_Apple_토큰도_401() throws Exception {
        mvc.perform(get("/me")).andExpect(status().isUnauthorized());
        given(apple.verify("bad")).willThrow(new InvalidProviderTokenException(null));
        mvc.perform(post("/auth/apple").contentType(MediaType.APPLICATION_JSON).content("{\"identityToken\":\"bad\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 카카오_토큰은_우리_앱에서_발급된_것만_받는다() {
        assertThat(KakaoTokenVerifier.memberId(new KakaoTokenVerifier.TokenInfo(42, 1658837), 1658837)).isEqualTo("42");
        assertThatThrownBy(() -> KakaoTokenVerifier.memberId(new KakaoTokenVerifier.TokenInfo(42, 999), 1658837))
                .isInstanceOf(InvalidProviderTokenException.class);
    }
}
