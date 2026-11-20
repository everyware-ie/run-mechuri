package com.mechuri.runary.account;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

/**
 * Apple identity token을 Apple 공개키(JWKS)로 검증한다.
 * https://developer.apple.com/documentation/signinwithapple/verifying-a-user
 */
@Component
public class AppleTokenVerifier {

    private static final String ISSUER = "https://appleid.apple.com";

    private final NimbusJwtDecoder decoder;

    AppleTokenVerifier(@Value("${app.apple.bundle-id}") String bundleId) {
        decoder = NimbusJwtDecoder.withJwkSetUri(ISSUER + "/auth/keys").build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(ISSUER),
                new JwtClaimValidator<List<String>>(JwtClaimNames.AUD, aud -> aud != null && aud.contains(bundleId))));
    }

    /** 검증된 Apple 사용자 ID(sub). */
    public String verify(String identityToken) {
        try {
            return decoder.decode(identityToken).getSubject();
        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidProviderTokenException(e);
        }
    }
}
