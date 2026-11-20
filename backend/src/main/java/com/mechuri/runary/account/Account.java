package com.mechuri.runary.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** 로그인 수단 + 수단별 사용자 ID로 식별한다. 닉네임이 없으면 가입 미완료(로그인 FRD §3-2). */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"provider", "providerUserId"}))
public class Account {

    public enum Provider { APPLE, KAKAO }

    @Id
    @GeneratedValue
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Provider provider;

    @Column(nullable = false)
    private String providerUserId;

    // 영문은 소문자만 저장하므로 유니크 제약이 곧 중복 검사다(로그인 FRD §4)
    @Column(unique = true, length = 10)
    private String nickname;

    protected Account() {
    }

    Account(Provider provider, String providerUserId) {
        this.provider = provider;
        this.providerUserId = providerUserId;
    }

    public Long getId() { return id; }
    public Provider getProvider() { return provider; }
    public String getNickname() { return nickname; }
    void setNickname(String nickname) { this.nickname = nickname; }
}
