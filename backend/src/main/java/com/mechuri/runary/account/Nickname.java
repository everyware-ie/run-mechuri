package com.mechuri.runary.account;

import java.util.Locale;
import java.util.regex.Pattern;

/** 로그인 FRD §4 닉네임. 앱이 보낸 값을 믿지 않고 서버에서 다시 정리·검사한다. */
final class Nickname {

    // 한글은 완성형만. 자모 단독(ㄱ, ㅏ)은 받지 않는다
    private static final Pattern ALLOWED = Pattern.compile("[가-힣a-z0-9]+");

    private Nickname() {
    }

    /** 앞뒤 공백을 지우고 영문을 소문자로 바꾼다. */
    static String normalize(String raw) {
        return raw == null ? "" : raw.strip().toLowerCase(Locale.ROOT);
    }

    /** 규칙에 맞으면 null, 아니면 오류 코드. */
    static String error(String nickname) {
        int length = nickname.codePointCount(0, nickname.length());
        if (length < 2 || length > 10) return "INVALID_LENGTH";
        if (!ALLOWED.matcher(nickname).matches()) return "INVALID_CHARS";
        return null;
    }
}
