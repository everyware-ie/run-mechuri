package com.mechuri.runary.account;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 카카오 access token을 카카오 API로 확인한다.
 * https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#get-token-info
 */
@Component
public class KakaoTokenVerifier {

    private final RestClient client;
    private final long appId;

    KakaoTokenVerifier(@Value("${app.kakao.app-id}") long appId) {
        this.client = RestClient.create("https://kapi.kakao.com");
        this.appId = appId;
    }

    /** 검증된 카카오 회원번호. */
    public String verify(String accessToken) {
        TokenInfo info;
        try {
            info = client.get().uri("/v1/user/access_token_info")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .retrieve()
                    .body(TokenInfo.class);
        } catch (HttpClientErrorException e) {
            throw new InvalidProviderTokenException(e);
        }
        return memberId(info, appId);
    }

    // 토큰이 유효해도 다른 앱에서 발급된 것이면 거절한다. 남의 앱 토큰으로 우리 계정에 로그인하는 것을 막는다
    static String memberId(TokenInfo info, long appId) {
        if (info == null || info.appId() != appId) throw new InvalidProviderTokenException(null);
        return String.valueOf(info.id());
    }

    record TokenInfo(long id, @JsonProperty("app_id") long appId) {
    }
}
