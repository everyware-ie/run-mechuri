# docs 구조

기획(아이디에이션 → 회의 → 결정 → 스펙)과 개발 문서가 **모두 이 레포에** 있다.
2026-08-04 kill-betting에서 검증된 구조를 템플릿으로 이 레포를 부트스트랩하며, 허브(mechuri-docs)에 있던 러닝 아이디에이션 원문을 이관했다.

```
docs/
├── ideation/<닉네임>/      # 개인 아이디어 원문 (raw, 불변 — 고쳐 쓰지 않고 새 노트로 보완)
├── meetings/<YYYY-MM-DD>/ # 회의 종합 (synthesis.md)
├── decisions/             # 의사결정 (index.md 포함, decided 이후 변경은 "개정" append)
├── specs/
│   ├── frd/               # 기능정의서 — 구현 근거 (approved만 유효)
│   └── prd/               # 제품 요구 문서
├── topics/                # 주제별 종합
├── ops/                   # 운영
├── marketing/
└── product/features/      # 기능별 구현 노트 (코드 착수 후 생성 — FRD 원문 아님)
```

## 탐색 가이드

| 궁금한 내용 | 참고 문서 |
|------------|----------|
| **왜 이 제품인지, 어떤 아이디어가 나왔는지** | `meetings/2026-07-14/synthesis.md`, `topics/concept-candidates.md` |
| **지금까지의 결정** | `decisions/index.md` |
| **기능 명세 (FRD) - 구현 근거** | [`specs/frd/README.md`](specs/frd/README.md) - 6개 분할과 작성 순서. 경로 렌더링이 `draft` |
| **제품 요구 문서 (PRD)** | `specs/prd/running-drawing-mvp.md` (러닝 드로잉 MVP, `draft`) |
| **아이디어 원문 쌓기** | `ideation/<본인 닉네임>/` (`idea/<닉네임>` 브랜치에서) |

## 허브(mechuri-docs)와의 관계

기획 문서의 정본은 이 레포다. 허브에는 다음만 남는다:

- **제품 대장** — 어느 제품이 어느 repo인지(순회 시작점)
- **팀 공통** — 프로세스 결정, 컨벤션, 템플릿
- **통합 회의 기록** — 여러 제품이 함께 논의된 전체 회의
- 노션 이관 아카이브 등 불변 원자료

## 아이디에이션 규약

- 브랜치: **`idea/<닉네임>`** — 개인 상시 브랜치, 머지 후에도 삭제하지 않고 재사용
- 경로: **`docs/ideation/<본인 닉네임>/`** — 본인 폴더에만 쓴다. 타인의 raw는 읽기 전용
- raw는 **불변** — 완료한 원문은 고쳐 쓰지 않고 새 노트로 보완한다
