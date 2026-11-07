# readme-features — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D16(구성, 스크린샷, 번역). D14(지원 아키텍처)와 D9–D11(업데이트 동작)의 결론을 Install 절에 옮긴다.

## 영향 범위

- `README.md`, 새 이미지 디렉터리(`docs/assets/readme/`로 한다; DIRECTORY.md에 한 줄).
- 앱·CLI·형식: 영향 없음. 순수 함수 대상 없음(문서). PoC 의존: 없음.
- 저장소 크기: 이미지는 장당 수백 KB 이하로 줄인다(WebP 또는 PNG). 지금 5 MB가 넘는 blob이 없다(부모 design.md '공개 전 위험 점검').

## 구성 (D16)

참고 구조: Orca README(https://github.com/stablyai/orca#readme)의 Features 두 칸 표, Open Design README(https://github.com/nexu-io/open-design#readme)의 'Why' 목록과 Quick start. 문구는 Doan 것으로 새로 쓴다.

1. 제목, 한 줄 소개(지금 README.md:3을 다듬는다), 배지(라이선스, 최신 릴리스), 대표 이미지 한 장.
2. Download — R2 전까지 "Pre-release: build from source" 한 줄.
3. Features — 아래 표의 항목마다 제목, 두세 문장, 이미지 한 장.
4. Supported agents — 다섯 공급자와 각각 되는 것(PRODUCT §2·§3 In scope 7·9).
5. Install and requirements — macOS Apple silicon(D14), Applications로 옮기면 `doan` 명령과 스킬을 설정한다는 점(PRODUCT §5 항목 0 'Agent setup'), 업데이트 방식(app-update 결론).
6. CLI — 명령 목록 한 줄씩(지금 README.md:23).
7. Build from source — 지금 README.md:26–37 유지.
8. Documents, Contributing(community-docs 링크), Background(세 문장으로 줄이고 자세한 글은 이력에 둔다), References(지금 표 유지), License.

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
| Design presets | README.md:24, ARCHITECTURE §9 고지 |

## 스크린샷

- 실제 앱(서명된 빌드 또는 로컬 패키지)에서, 격리된 HOME과 데모 저장소(가상의 `acme/studio` 같은 이름, 테스트 픽스처와 같은 관례)로 찍는다. 실제 계정 이메일, 사용량 숫자, 개인 경로가 보이면 안 된다.
- 실제 앱 실행은 AGENTS.md 'Commands'의 격리 규칙(`--user-data-dir=<tmp>`, 임시 HOME, 가짜 SHELL)을 따른다. 로그인이 필요한 화면을 어떤 계정으로 찍을지는 그때 사용자에게 묻는다.
- 누가 찍을지(사용자 또는 에이전트의 runtime probe)는 T2를 시작할 때 사용자에게 묻는다.
