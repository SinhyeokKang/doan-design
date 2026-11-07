# readme-features — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D16(구성, 번역), D28(Background와 PRODUCT §1), D29(이미지는 캔버스에서), '사용자 결정' 5(지금 `main`에서, community-docs 뒤). D14(지원 아키텍처)를 Install 절에 옮긴다. 업데이트 동작(D9–D11)은 app-update가 구현된 뒤 부모 R2가 넣는다.

## 영향 범위

- `README.md`, 새 캔버스 `.doan/canvases/readme-features.html`, 새 이미지 디렉터리 `docs/assets/readme/`(DIRECTORY.md에 한 줄), `docs/PRODUCT.md` §1(D28), AGENTS.md 'Documents' 표의 README 행과 'References'.
- 앱·CLI·형식: 영향 없음. 순수 함수 대상 없음(문서). PoC 의존: 없음.
- 저장소 크기: 이미지는 이력에 영원히 남으므로 장당 500 KB 이하, 9장 안팎으로 둔다. 화면이 바뀔 때만 다시 내보낸다. 지금 5 MB가 넘는 blob이 없다(부모 design.md '공개 전 위험 점검').

## 구성 (D16)

참고 구조: Orca README(https://github.com/stablyai/orca#readme)의 Features 두 칸 표, Open Design README(https://github.com/nexu-io/open-design#readme)의 'Why' 목록과 Quick start. 문구는 Doan 것으로 새로 쓴다.

1. 제목, 한 줄 소개(지금 README.md:3을 다듬는다), 라이선스 배지(릴리스 배지는 R2), 대표 이미지 한 장.
2. Download — R2 전까지 "Pre-release: build from source" 한 줄. 상태 줄은 "pre-release".
3. Features — 아래 표의 항목마다 제목, 두세 문장, 이미지 한 장.
4. Supported agents — 다섯 공급자와 각각 되는 것(PRODUCT §2·§3 In scope 7·9).
5. Install and requirements — macOS Apple silicon(D14), Applications로 옮기면 `doan` 명령과 스킬을 설정한다는 점(PRODUCT §5 항목 0 'Agent setup'). 업데이트 문단은 R2에서 더한다.
6. CLI — 명령 목록 한 줄씩(지금 README.md:23).
7. Build from source — 지금 README.md:26–37 유지.
8. Documents, Contributing(`docs/CONTRIBUTING.md` 링크), Background(세 문장, 근거는 PRODUCT §1을 가리킨다), References(지금 표 유지), License.

## Features 후보 (PRODUCT 근거)

| 항목 | 근거 |
|---|---|
| Canvases in your repo — 에이전트가 `.doan/canvases/`에 쓰고 `doan check`로 확인 | PRODUCT §3 In scope 1·4·5 |
| Talk on the canvas — 프레임·요소·지점 칩, Capture area | §3 In scope 2, §5 항목 2·6 |
| Agent conversations — Home, Overview, 캔버스 대화 패널, 대기열·Send now | §3 In scope 6, §5 항목 1·3 |
| Your agents, your accounts — 다섯 공급자, 사용량 | §3 In scope 7 |
| Works with terminal agents — `doan work`, `doan open`, 스킬 자동 설정 | §3 In scope 3, §5 항목 0·10 |
| Export — HTML 한 파일 | §3 In scope 8 |
| MCP connectors | §3 In scope 9 |
| Design presets | PRODUCT §5 CLI 'Design presets'(docs/PRODUCT.md:327), §5 항목 1 Home의 Presets(docs/PRODUCT.md:204) |

## Malmoi 근거 이동 (D28)

- README.md:52–60의 근거 항목(DesignSync `get_file` 256 KiB 한도, 수정이 흩어진 29곳 등 다섯 항목)을 PRODUCT §1의 문제 목록 뒤에 "Observed in the Malmoi case" 같은 짧은 목록으로 옮긴다. 수치와 출처는 바꾸지 않는다.
- PRODUCT §1의 "Source: the Malmoi case in the README background." 줄을 그 목록을 가리키게 고친다.
- README Background는 세 문장으로 줄이고 PRODUCT §1을 링크한다.

## 이미지 (D29)

- 앱을 찍지 않는다. `.doan/canvases/readme-features.html`(id `readme-features`)에 기능마다 프레임 하나(대표 이미지 포함 9개)를 그린다. 프레임은 출시된 화면의 모양을 따르되 데이터는 모두 더미다(가상의 `acme/studio` 같은 저장소 이름, `/Users/you/…` 경로, `you@example.com`, 가짜 사용량). 계정·사용량 영역도 더미로 그린다.
- 캔버스 규칙은 다른 초안과 같다: `tokens.css`를 상대 경로로 링크하고, 프레임마다 `data-doan-frame`과 `data-doan-title`, `doan check`에 새 오류 없음(`/design-draft`의 규칙).
- 내보내기: `.scratch/readme-features/export.mjs`(커밋하지 않음)가 `app/node_modules`의 Playwright Chromium으로 캔버스 파일을 열고, 프레임 요소마다 `deviceScaleFactor: 2` 스크린샷을 `docs/assets/readme/<frame id>.png`로 저장한다. 크기가 500 KB를 넘으면 배율이나 프레임 크기를 줄인다. 같은 스크립트를 다시 돌리면 같은 이미지를 낸다.
- 화면이 바뀌면 캔버스를 고치고 다시 내보낸다. 이 절차를 승격 때 AGENTS.md 'Documents'의 README 행에 한 줄로 남긴다.
