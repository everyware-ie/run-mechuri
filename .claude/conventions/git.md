# Git 컨벤션

## 브랜치 전략

```
main        ← 배포 브랜치 (직접 push 금지)
develop     ← 통합 브랜치
feature/*   ← 기능 개발
fix/*       ← 버그 수정
chore/*     ← 설정, 의존성 등 비기능 변경
```

### 브랜치 네이밍
형식: `<작업자>/<작업 유형>/<기능>`

```
jminkkk/feature/score-calculation
jminkkk/feature/match-image-upload
jminkkk/fix/kill-count-parsing-error
jminkkk/chore/add-eslint-config
```

---

## 커밋 메시지

형식: `<type>(scope): <description>`

| type | 사용 상황 |
|------|-----------|
| feat | 새 기능 추가 |
| fix | 버그 수정 |
| refactor | 기능 변경 없는 코드 개선 |
| test | 테스트 추가/수정 |
| docs | 문서 변경 |
| chore | 빌드, 설정 변경 |

### 예시
```
feat(match): 매치 결과 이미지 업로드 API 추가
fix(match): 킬 수 파싱 시 닉네임 특수문자 처리 오류 수정
refactor(session): SessionScoreCalculator 서비스 분리
test(match): MatchResultParser 단위 테스트 추가
```

---

## PR 규칙

- PR 제목은 커밋 메시지 형식과 동일
- `feature/*` → `develop` 머지는 PR 필수
- `develop` → `main` 머지는 PR 필수 + approval 후 머지

### PR 본문 형식

`.github/pull_request_template.md`를 그대로 사용한다.

### PR 라벨

커밋 타입과 동일한 라벨을 필수로 붙인다.

### AI 메타데이터 (AI와 함께 작업한 경우 필수)

```markdown
## AI 메타데이터

| 항목 | 값 |
|------|-----|
| 모델 | claude-sonnet-4-6 |
| 워크플로우 | /feature-start ✅ \| /to-prd ❌ (docs 타입 — 이번 세션에서 예외 조항 신설) \| /to-issues (인라인 참조) |
| 세션 시간 | 2026-06-24 07:47 → 09:39 (약 1시간 52분) |
| 턴 수 | 188회 |
| 생성 토큰 | 120,349 |
| 컨텍스트 누적 읽기 | 16,040,827 (캐시 히트) |
| 신규 컨텍스트 추가 | 218,533 |
| 비고 | 다른 프로젝트 내용 잔재 발견(com.kakaoinsurancequiz.kjm) 수정, 범위를 점진적으로 확장하며 진행 |

```
