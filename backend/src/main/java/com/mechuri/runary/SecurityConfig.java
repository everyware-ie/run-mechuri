package com.mechuri.runary;

import java.util.Base64;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

/** 우리 서버 토큰(HS256 JWT)을 발급·검증한다. /auth/** 외에는 토큰이 있어야 한다. */
@Configuration
class SecurityConfig {

    private final SecretKey key;

    SecurityConfig(@Value("${app.jwt-secret:}") String secret) {
        if (secret.isBlank()) {
            throw new IllegalStateException("app.jwt-secret이 없습니다. backend/config/application.properties에 넣어 주세요");
        }
        byte[] bytes = Base64.getDecoder().decode(secret);
        // HS256 키는 32바이트 이상이어야 한다. 짧으면 첫 로그인 때가 아니라 지금 실패시킨다
        if (bytes.length < 32) {
            throw new IllegalStateException("app.jwt-secret은 Base64로 32바이트 이상이어야 합니다. openssl rand -base64 32로 만드세요");
        }
        key = new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a.requestMatchers("/auth/**", "/error").permitAll().anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))
                .build();
    }

    @Bean
    JwtDecoder jwtDecoder() {
        return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    JwtEncoder jwtEncoder() {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }
}
