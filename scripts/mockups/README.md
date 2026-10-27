# 기본 배경 시안 생성 스크립트

기본 배경 6장(2026-10-21 교체)을 만든 스크립트. **numpy와 Pillow가 필요하다.**
기존 `scripts/generate-backgrounds.py`(표준 라이브러리만 사용)와는 별개다.

이 폴더 안에서 실행한다(서로 import한다).

```
cd scripts/mockups
python3 gen_run.py     # river-dawn, track, bridge, avenue 포함 9장 → outr/
python3 gen_run2.py    # coast-road2, quail-hill(러너 버전 runner-hill2 포함) → outr2/
```

앱에 들어간 것은 `outr/river-dawn·track·bridge·avenue.png`와 `outr2/coast-road2·quail-hill.png`이고
`frontend/assets/backgrounds/bg-*.png`로 복사했다. 실행하면 `outr/`·`outr2/`·`out*/` 폴더가 생기는데 커밋하지 않는다.
