package com.mechuri.runary.account;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * 탈퇴할 때 Apple 토큰을 해지한다(로그인 FRD §7-2).
 * 앱이 탈퇴 직전에 Apple 로그인을 한 번 더 받아 authorization code를 넘긴다. 이 코드를 토큰으로 바꾼 뒤 바로 해지한다.
 * 그래서 Apple refresh token을 서버에 보관하지 않는다.
 * https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
 *
 * Sign in with Apple 키(.p8)와 Key ID가 설정돼 있어야 한다. 없으면 해지만 건너뛰고 경고를 남긴다(로컬 개발).
 */
@Component
public class AppleTokenRevoker {

    private static final Logger log = LoggerFactory.getLogger(AppleTokenRevoker.class);
    private static final String APPLE = "https://appleid.apple.com";

    private final RestClient client = RestClient.create(APPLE);
    private final String bundleId;
    private final String teamId;
    private final String keyId;
    private final String keyPath;

    AppleTokenRevoker(@Value("${app.apple.bundle-id}") String bundleId,
                      @Value("${app.apple.team-id}") String teamId,
                      @Value("${app.apple.key-id:}") String keyId,
                      @Value("${app.apple.private-key-path:}") String keyPath) {
        this.bundleId = bundleId;
        this.teamId = teamId;
        this.keyId = keyId;
        this.keyPath = keyPath;
    }

    public void revoke(String authorizationCode) {
        if (keyId.isBlank() || keyPath.isBlank()) {
            log.warn("app.apple.key-id·private-key-path가 없어 Apple 토큰 해지를 건너뜁니다");
            return;
        }
        String secret = clientSecret(readKey(Path.of(keyPath)), teamId, keyId, bundleId, Instant.now());
        Map<?, ?> token = client.post().uri("/auth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form("client_id", bundleId, "client_secret", secret, "code", authorizationCode, "grant_type", "authorization_code"))
                .retrieve().body(Map.class);
        client.post().uri("/auth/revoke")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form("client_id", bundleId, "client_secret", secret,
                        "token", String.valueOf(token.get("refresh_token")), "token_type_hint", "refresh_token"))
                .retrieve().toBodilessEntity();
    }

    /** Apple이 요구하는 client secret: .p8 키로 서명한 ES256 JWT. 5분만 유효하게 만든다. */
    static String clientSecret(ECPrivateKey key, String teamId, String keyId, String bundleId, Instant now) {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(teamId)
                .subject(bundleId)
                .audience(APPLE)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(keyId).build(), claims);
        try {
            jwt.sign(new ECDSASigner(key));
        } catch (JOSEException e) {
            throw new IllegalStateException("Apple client secret 서명 실패", e);
        }
        return jwt.serialize();
    }

    static ECPrivateKey readKey(Path p8) {
        try {
            String pem = Files.readString(p8).replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(pem)));
        } catch (Exception e) {
            throw new IllegalStateException("Apple .p8 키를 읽지 못했습니다: " + p8, e);
        }
    }

    private static MultiValueMap<String, String> form(String... pairs) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        for (int i = 0; i < pairs.length; i += 2) form.add(pairs[i], pairs[i + 1]);
        return form;
    }
}
