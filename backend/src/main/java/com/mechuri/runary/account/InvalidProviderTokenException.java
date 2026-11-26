package com.mechuri.runary.account;

/** Apple·카카오 토큰이 유효하지 않거나 우리 앱에서 발급된 것이 아니다. */
class InvalidProviderTokenException extends RuntimeException {
    InvalidProviderTokenException(Throwable cause) {
        super(cause);
    }
}
