package com.mechuri.runary.account;

import java.time.Duration;
import java.time.Instant;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** 로그인 FRD §3 가입과 로그인, §4 닉네임. */
@RestController
class AccountController {

    // ponytail: refresh 토큰 없음. 만료되면 다시 로그인한다. 로그인 유지가 문제 되면 refresh 토큰을 추가
    private static final Duration TOKEN_TTL = Duration.ofDays(30);

    private final AccountRepository accounts;
    private final AppleTokenVerifier apple;
    private final KakaoTokenVerifier kakao;
    private final JwtEncoder encoder;

    AccountController(AccountRepository accounts, AppleTokenVerifier apple, KakaoTokenVerifier kakao, JwtEncoder encoder) {
        this.accounts = accounts;
        this.apple = apple;
        this.kakao = kakao;
        this.encoder = encoder;
    }

    record AppleLogin(String identityToken) {}
    record KakaoLogin(String accessToken) {}
    /** nickname이 null이면 가입 미완료. 앱은 닉네임 입력으로 보낸다 */
    record AuthResponse(String token, String nickname) {}
    record Me(String nickname, Account.Provider provider) {}
    record NicknameRequest(String nickname) {}
    record ErrorBody(String code) {}

    @PostMapping("/auth/apple")
    AuthResponse apple(@RequestBody AppleLogin request) {
        return login(Account.Provider.APPLE, apple.verify(request.identityToken()));
    }

    @PostMapping("/auth/kakao")
    AuthResponse kakao(@RequestBody KakaoLogin request) {
        return login(Account.Provider.KAKAO, kakao.verify(request.accessToken()));
    }

    // ponytail: 같은 사람이 동시에 첫 로그인하면 유니크 제약에 걸려 한쪽이 500. 드물어서 재시도로 충분
    private AuthResponse login(Account.Provider provider, String providerUserId) {
        Account account = accounts.findByProviderAndProviderUserId(provider, providerUserId)
                .orElseGet(() -> accounts.save(new Account(provider, providerUserId)));
        return new AuthResponse(issue(account), account.getNickname());
    }

    @GetMapping("/me")
    Me me(@AuthenticationPrincipal Jwt jwt) {
        Account account = current(jwt);
        return new Me(account.getNickname(), account.getProvider());
    }

    @PutMapping("/me/nickname")
    ResponseEntity<?> nickname(@AuthenticationPrincipal Jwt jwt, @RequestBody NicknameRequest request) {
        String nickname = Nickname.normalize(request.nickname());
        String error = Nickname.error(nickname);
        if (error != null) return ResponseEntity.badRequest().body(new ErrorBody(error));

        Account account = current(jwt);
        account.setNickname(nickname);
        try {
            accounts.saveAndFlush(account);
        } catch (DataIntegrityViolationException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorBody("DUPLICATE"));
        }
        return ResponseEntity.ok(new Me(account.getNickname(), account.getProvider()));
    }

    @ExceptionHandler(InvalidProviderTokenException.class)
    ResponseEntity<ErrorBody> invalidProviderToken() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorBody("INVALID_PROVIDER_TOKEN"));
    }

    private Account current(Jwt jwt) {
        return accounts.findById(Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private String issue(Account account) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(account.getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(TOKEN_TTL))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
