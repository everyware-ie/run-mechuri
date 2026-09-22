# CLAUDE.md

이 저장소의 AI 작업 규약은 이 문서를 정본으로 삼는다. Claude와 Codex를 포함한 모든 AI 도구에 적용한다. 세부 규약은 이 문서에서 연결한 `.claude/` 문서에서 관리한다. [AGENTS.md](AGENTS.md)는 이 원문을 읽고 적용했는지 확인하는 진입 체크리스트다.

## 시작하기 전에

이 문서 전체와 작업에 해당하는 세부 규약을 읽고 시작한다. 요약이나 이전 세션의 기억으로 대신하지 않는다.

| 작업 | 읽을 문서 |
|---|---|
| 문서를 쓰거나 고칠 때 | [문서 작성 컨벤션](.claude/conventions/writing.md) |
| 브랜치를 만들거나 커밋·PR을 준비할 때 | [Git 컨벤션](.claude/conventions/git.md) |
| 제품 용어를 쓰거나 새로 만들 때 | [용어집](.claude/domain/glossary.md) |

**무엇을 어떻게 할지 먼저 알리고 확인을 받은 뒤에 진행한다.** 임의로 앞서 나가지 않는다.

## 서비스 개요

러닝 관련 서비스. 팀메추리의 세 번째 프로덕트. **제품명은 `Runary`(러너리)다** ([2026-09-16 결정](docs/decisions/2026-09-16-product-name-runary.md)). 8월부터 잠정으로 쓰던 "메추리런"을 대체한다. **번들 ID `com.mechuri.runmechuri`는 그대로 간다.** App Store Connect에 등록된 앱과 묶여 있어 바꾸려면 앱을 새로 만들어야 한다.
**`ideation` 단계는 끝났다.** [2026-08-25 결정](docs/decisions/2026-08-25-react-native-expo-stack.md)으로 기술 스택(React Native + Expo)이 정해지고 FRD 7개가 `approved`로 승격되며 구현이 시작됐다. 배경: [docs/meetings/2026-07-14/synthesis.md](docs/meetings/2026-07-14/synthesis.md)

## 기획 문서의 정본 (이 레포)

기능의 **무엇·왜**(정책·기능정의·요구사항)는 이 레포의 `docs/specs/frd/`가 유일한 진실이다.
아이디에이션 → 회의 → 결정 → 스펙 → 구현이 **한 레포 안에서** 이어진다.

- `docs/specs/frd/` — 기능정의서(FRD). **approved만 구현 근거**다. draft/review는 아니다
- `docs/specs/prd/` - 제품 요구 문서(PRD). **PRD 없이 제품 기능을 만들기 시작하지 않는다**
- `docs/product/features/` — 기능별 **구현 노트**(FRD 링크 + 코드 구조·기술 선택). 규칙 원문을 복사하지 않는다
- `docs/decisions/`, `docs/meetings/`, `docs/topics/`, `docs/ideation/<닉네임>/` — 결정·회의·주제 종합·개인 raw

스펙과 구현이 같은 레포에 있으므로, **불일치를 발견하면 같은 PR에서 함께 고치는 것을 기본**으로 한다.

**디자인 시안과 FRD가 부딪치면 FRD를 따른다** ([2026-09-01 결정](docs/decisions/2026-09-01-frd-over-mockup.md)). 시안은 좋은 제안이지만 팀 승인 절차를 거치지 않았고, FRD는 팀이 `approved`로 확정한 것이다.

**다만 FRD가 항상 옳다는 뜻은 아니다.** FRD대로 만들었더니 불편하거나 이상하면 **이슈로 올려 FRD를 고친 뒤 진행한다.** 바꾸지 말자는 것이 아니라 조용히 갈라지지 말자는 것이다.

### 기획 문서 정합성

문서를 고도화하면 상류 문서가 조용히 낡는다. **FRD를 쓰다 보면 PRD가 낡고, PRD를 고치면 결정문과 어긋난다.** 아래를 규칙으로 둔다.

**상류 관계**

```
결정문 (무엇을 정했나)
   ↓
PRD (무엇을 왜 만드나)
   ↓
FRD (화면과 기능의 규칙·수치)
   ↓
구현 노트 (코드 구조)
```

1. **하류를 고치다 상류가 낡으면 같은 PR에서 함께 고친다.** 나중에 몰아서 하면 어느 쪽이 맞는지 알 수 없게 된다
2. **스펙이 조용히 제품 정의를 바꾸지 못하게 한다.** FRD에서 새 결정이 나오면 PRD에 올린다
3. **팀이 정한 것을 개인이 문서에서 뒤집지 않는다.** 결정문과 어긋나면 결정문에 개정을 append 한다
4. **절 번호로 참조할 때는 제목도 함께 적는다.** "§7"이 아니라 "§7 결과물의 형태". 절이 하나 끼어들면 번호만으로는 조용히 어긋난다
5. **새 용어를 만들거나 뜻을 바꾸면 [용어집](.claude/domain/glossary.md)부터 고친다.** 같은 말을 두 뜻으로 쓰는 것이 가장 흔한 어긋남이다
6. 어느 FRD가 PRD의 어느 부분을 근거로 하는지는 `docs/specs/frd/README.md`의 근거 지도에 있다. FRD frontmatter의 `derives_from`·`prd_sections`에도 같은 내용이 들어간다

**문서를 쓰고 고칠 때의 문체는 [문서 작성 컨벤션](.claude/conventions/writing.md)을 따른다.** 위가 문서끼리 어긋나지 않게 하는 규칙이라면, 그쪽은 한 문서를 사람이 읽을 수 있게 하는 규칙이다.

**규약을 바꿀 때는 해당 원문만 수정한다.** `AGENTS.md`에 규약 본문이나 요약을 복사하지 않는다. 문서 경로나 읽어야 할 문서가 바뀌면 `AGENTS.md`의 링크와 체크리스트도 함께 고친다.

**자동 검사**

```
python3 scripts/check-docs.py
```

깨진 링크, frontmatter 필수 필드와 status 유효값, FRD의 `derives_from`을 검사하고 `[확인 필요]` 항목을 집계한다. `docs/`를 건드린 커밋에서 pre-commit 훅이 자동으로 돌린다.

> **부트스트랩 배경**: kill-betting 제품에서 먼저 검증된 구조([2026-08-03 결정](https://github.com/everyware-ie/mechuri-docs/blob/main/team/decisions/2026-08-03-ideation-pipeline-location.md))를 템플릿으로 이 레포를 새로 만들었다(2026-08-04). 허브(mechuri-docs)에 쌓여 있던 `products/running/` 아이디에이션 원문을 그대로 이관했다.

### 허브에 남는 것

- **제품 대장**(어느 제품이 어느 repo인지) · **팀 공통 프로세스 결정·컨벤션** · **여러 제품 통합 회의 기록** · 노션 이관 아카이브

### 아이디에이션 규약

- 브랜치 **`idea/<닉네임>`**(개인 상시, 머지 후 재사용), 경로 **`docs/ideation/<본인 닉네임>/`**
- raw는 불변 — 고쳐 쓰지 않고 새 노트로 보완. 타인 폴더는 읽기 전용

## 레포 구조

```
/
├── .claude/domain/glossary.md  # 도메인 용어집 (문서·코드 공통)
├── docs/
│   ├── ideation/<닉네임>/    # 개인 아이디어 원문 (raw, 불변)
│   ├── meetings/             # 회의 종합
│   ├── decisions/            # 의사결정
│   ├── specs/
│   │   ├── frd/               # 기능정의서 — 구현 근거 (approved만 유효)
│   │   └── prd/               # 제품 요구 문서
│   ├── topics/                # 주제별 종합
│   ├── ops/                   # 운영
│   ├── marketing/
│   └── product/features/      # 기능별 구현 노트 (코드 착수 후 생성)
├── scripts/hooks/              # git 훅 (아래 "강제 게이트" 참고)
├── AGENTS.md                        # AI 작업 규약 원문을 읽기 위한 체크리스트
├── .claude/conventions/git.md      # 브랜치·커밋 규칙
├── .claude/conventions/writing.md  # 문서 문체 규칙
├── frontend/                    # React Native + Expo 앱 (2026-08-25 스캐폴딩)
│   └── src/{app,components,constants,hooks}  # Expo Router 기본 템플릿 구조
└── CLAUDE.md
```

**아직 없는 것** (코드 착수 시점에 추가):
- `docs/architecture/` — 아키텍처 결정 없음. 브릿지 3건(HealthKit·AVFoundation·인스타 공유)의 실제 설계는 [2026-08-25 결정](docs/decisions/2026-08-25-react-native-expo-stack.md) 이후 착수하며 정리한다

## 강제 게이트 (훅으로 자동 적용)

kill-betting에서 검증된 훅을 그대로 설치했다. `backend/src/main`·`frontend/{app,components,features,lib}`(Expo 기본 템플릿은 `src/` 아래에 두므로 `frontend/src/{app,components,features,lib}`도 동일하게 대상) 편집 시점부터 동작한다. **FRD 7개가 2026-08-25에 전부 `approved`로 승격됐으므로 이제 실질적으로 발동한다.**

approved FRD라도 착수 전 확인 단계를 건너뛰지 못하도록 두 지점에서 훅이 강제한다:

1. **구현 착수 시점** (`pre-implementation-frd-check.sh`): 구현 메인 소스를 편집할 때, **이 브랜치에** 확인 노트(`docs/product/features/<기능>.md`, FRD 링크 포함)가 하나도 없으면 편집이 차단된다. 테스트 파일은 대상 아님(TDD test-first 허용), 브랜치 타입 `chore`·`docs`는 면제. 노트를 만들려면 `docs/specs/frd/`의 FRD를 가져와 사용자에게 보여주고 확인받는 단계를 거쳐야 한다. **"바로 진행"으로도 이 단계는 건너뛸 수 없다.**
2. **PR 생성 시점** (`pre-pr-checklist.sh`): PR이 참조하는 FRD(본문·`--body-file`·이 브랜치의 구현 노트 링크에서 수집)의 `status`가 `approved`가 아니면 PR 생성이 차단된다.

로컬 설치: `sh scripts/hooks/install.sh`

## 팀 & 스택

**역할** (2026-09-08 회의에서 다시 나눴다)

| 사람 | 파트 |
|---|---|
| JiEung2 | **성능 개선 리서치.** 그전까지 개발 전반 |
| jminkkk | **성능 개선 리서치.** 그전까지 디자인 |
| phs00 | 홍보와 마케팅, 기획 문서(PRD·FRD) 유지보수, **구현** |

**핵심 플로우가 끝에서 끝까지 돌기 시작하면서** 만드는 일에서 다듬는 일로 무게가 옮겨갔다([2026-09-08 결정](docs/decisions/2026-09-08-scope-and-roles.md)).

개발 방식은 사이드 프로젝트다.

**기술 스택: React Native + Expo** ([2026-08-25 결정](docs/decisions/2026-08-25-react-native-expo-stack.md))

UI는 RN으로 짜고, Swift로만 되는 것은 브릿지로 연결한다. 브릿지 대상은 셋이다.

| API | 무엇에 쓰나 |
|---|---|
| HealthKit | 러닝 기록과 경로 좌표 읽기 |
| AVFoundation | 프레임 렌더링과 mp4 인코딩 |
| Sharing to Stories | 인스타그램 스토리로 넘기기 |

**Expo Go로는 커스텀 네이티브 모듈이 돌아가지 않는다.** 세 브릿지를 쓰려면 development build나 prebuild가 필요하다.

**디자인 컨셉은 1a 야간 네온이다.** 어두운 캔버스에 경로가 빛으로 그려진다.

## 작업 흐름

### 아이디어에서 결정까지

```
개인 노트 → 회의 안건 → 회의 종합 → 결정문 → PRD·FRD
```

| 단계 | 어디에 |
|---|---|
| 개인 노트 | `idea/<닉네임>` 브랜치, `docs/ideation/<닉네임>/` |
| 회의 안건 | `docs/ideation/<닉네임>/<날짜>-meeting-agenda.md` |
| 회의 종합 | `docs/meetings/<날짜>/synthesis.md` |
| 결정문 | `docs/decisions/<날짜>-<주제>.md` + `index.md`에 한 줄 |

**개인 노트는 고치지 않는다.** 생각이 바뀌면 새 노트로 보완한다. 남의 폴더는 읽기 전용이다.

**안건은 회의 전에 공유한다.** 공유는 미리 하고 회의는 논의에 쓰기로 했다.

**결정이 제품 정의를 바꾸면 PRD를, 화면과 기능의 규칙을 바꾸면 FRD를 같은 PR에서 고친다.**

### 결정에서 구현까지

```
브랜치 → 구현 노트 → 구현 → 문서 동기화 → PR → 머지
```

1. **브랜치를 판다.** `<작업자>/<작업 유형>/<기능>` 형식이다. 작업 유형은 `feature`, `fix`, `chore`, `docs`다
2. **구현 노트를 만든다.** `docs/product/features/<기능>.md`에 FRD 링크를 넣는다. **이게 없으면 훅이 편집을 막는다**
3. **근거가 되는 FRD를 사용자에게 보여주고 확인받는다.** 이 단계는 건너뛸 수 없다
4. **구현한다**
5. **어긋난 것을 고친다.** FRD와 다른 점을 발견하면 구현 노트의 "어긋남 기록"에 적고, FRD도 같은 PR에서 고친다
6. **커밋 전에 확인한다**
7. **PR을 만든다.** 참조하는 FRD가 `approved`가 아니면 훅이 막는다

커밋 전 확인은 이 셋이다.

앱 타입·린트 검사는 `frontend/`에서, 문서 검사는 저장소 루트에서 실행한다.

```bash
node_modules/.bin/tsc --noEmit          # 타입
node_modules/.bin/eslint src/ modules/  # 린트
python3 scripts/check-docs.py           # 문서 (docs/를 건드렸을 때)
```

### 배포

명령과 주의사항은 [빌드·개발 명령어 모음](docs/ops/build-and-dev-commands.md)에 있다. 실기기 확인부터 TestFlight 제출까지 실제로 쓰는 것만 적혀 있다.

**배포하면 그 기록을 같은 문서에 남긴다.** 빌드 번호, PR, 제출 결과, 확인한 것.

### QA

내부 테스트에서 나온 것은 [QA 기록](docs/ops/qa-log.md)에 모은다. 카톡으로 오가는 것이 흘러가 버리기 때문이다.

```
제보 → QA 기록 → (정할 것이면) 회의 → 결정 → FRD 개정 → 구현
```

**바로 고칠 수 있는 것과 정해야 하는 것을 갈라 적는다.** 무엇이 아직 안 정해졌는지가 보여야 한다.

### 탐색은 이 흐름 밖이다

**실험, 프로토타입, 일회성 스크립트는 위 절차를 따르지 않아도 된다.** 배경 이미지를 만든 `scripts/generate-backgrounds.py`가 그렇게 나왔다.

**제품 코드로 들어가는 시점부터 규칙이 적용된다.** 탐색으로 얻은 결론이 제품을 바꾸면 그때 PRD나 FRD에 올린다.

> **2026-09-14 정정.** 이전 작업 흐름에 있던 `/feature-start`, `/to-prd`, `/to-issues`, `tdd`는 다른 저장소의 템플릿에서 따라온 것이며, 이 저장소에는 해당 커맨드가 없다.

## 규약을 적용하기 어려울 때

**규칙을 지키느라 나쁜 해법을 고르지 않는다.** FRD대로 만들었더니 불편하거나 절차가 상황에 맞지 않으면, 이유를 적고 변경을 제안한다. 합의 없이 규약과 다른 방향으로 진행하지 않는다.
