# doan-naming — survey

`.scratch/doan-naming/survey.mjs`가 2026-10-30에 `feat-doan-naming`(바꾸기 전, `4e497f4d`)에서 만든 표다. 분류는 `app/src/brand/candidates.ts`(공유 fixture `schema/fixtures/brand/cases.json`)를 따른다. 대문자 `Doan`은 이미 규칙에 맞아 표에 넣지 않았다.

판정 규칙(spec '결정'): 산문의 `doan` → `Doan`. 명령어(`doan check`, `doan CLI`, `doan MCP`, 백틱 안), 경로(`.doan/`, `bin/doan`), 식별자(`doan:canvas`, `data-doan-*`, `window.doan`, 리터럴 전체가 `doan`인 코드 토큰, 따옴표 안 서버 이름)는 소문자 그대로다. 메뉴 라벨·요소 텍스트처럼 화면에 그대로 보이는 자리의 `doan` 한 단어는 산문으로 본다.

## 1. 앱 문구 — 바꿈 60줄

A2 앱 검사(`app/src/brand/appText.test.ts`)의 위반 목록과 같다. 코드는 문자열 리터럴마다, HTML·스텁은 출현마다 한 줄이다.

| 위치 | 현재 문구 | 분류 | 판정 | 이유 |
|---|---|---|---|---|
| `app/src/main/agentAuth/manager.ts:460` | server logout failed; removing doan's copy | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/main/conversation/prompt.ts:36` | esign presets: if the user names a doan design preset, or one clearly fits | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/main/index.ts:254` | doan | 표시 문구(통째) | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/main/onboarding/machine.ts:157` | Move doan to Applications, then open it again | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/main/thumbnailWindow.ts:13` | doan thumbnails | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/AddProjectsDialog.tsx:36` | s of the same repository aren't in doan yet. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/AddProjectsDialog.tsx:56` | as a doan project? | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/AddProjectsDialog.tsx:57` | as a doan project? | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/AddProjectsDialog.tsx:57` | isn't a repository. doan will add it as a project that is no | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/ConnectionRows.tsx:50` | session to use doan. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/ConnectionRows.tsx:80` | Use doan in your terminal | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/FeedbackPanel.tsx:36` | Not a canvas ID — doan can't show or change these comments | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/Onboarding.tsx:33` | doan | 표시 문구(통째) | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/Onboarding.tsx:263` | This location is inside the doan project | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/Onboarding.tsx:267` | This folder’s doan configuration couldn’t be read. Fix | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/Onboarding.tsx:274` | Something changed while doan was checking. Try again. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/Onboarding.tsx:355` | Open doan | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/Onboarding.tsx:421` | Set up this folder for doan | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/Onboarding.tsx:466` | Open doan | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/Onboarding.tsx:578` | Set up doan | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/ShellSidebar.tsx:55` | Remove from doan | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/ShellSidebar.tsx:175` | Remove from doan | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:56` | ve this connection securely. Allow doan to use your Keychain, then sign in | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:68` | After you install it, doan checks again when you return. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:69` | This version is older than doan supports. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:69` | After you update it, doan checks again when you return. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:72` | doan couldn’t sign out of | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:79` | again so doan can confirm your organization. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:81` | doan couldn’t find its command-line tool | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:93` | doan checks this automatically when you | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/agentAuthView.ts:154` | doan couldn’t read its agent connections | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:9` | Move doan to Applications, then open it again | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:28` | r agents and your terminal can run doan. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:31` | is installed but can’t use doan yet. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:31` | Agents can’t run doan until the command is connected. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:38` | nger exists, so agents can’t reach doan. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:39` | Agents run a different doan, not the one in this app. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:40` | , not this app’s doan. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:55` | Fix the doan link? | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:65` | doan is running outside Applications, so | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:66` | k is broken, so agents can’t reach doan. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:67` | doan command runs another copy of doan, so agents may not reach this app. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:68` | , so agents can’t reach doan. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/connectionRowView.ts:69` | can’t use doan. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/firstPromptView.ts:10` | Your input stays in doan until you copy it. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/homeComposer.ts:31` | Use the doan design preset ` | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/inspector.ts:9` | doan can't tell where this value comes f | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/onboardingView.ts:46` | Move doan to Applications, then open it again | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/onboardingView.ts:50` | doan works through Claude Code or Codex. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/onboardingView.ts:150` | session to use doan. | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/onboardingView.ts:215` | Replace the doan link? | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/onboardingView.ts:215` | points to another copy of doan. Your terminal and agents will run | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/onboardingView.ts:219` | The skill stub from this app (doan | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/settingsWindow.tsx:116` | Your agents reach doan through these three. Each row says | 산문 | 바꿈 | 사람이 읽는 제품 이름 |
| `app/src/renderer/index.html:6` | doan | 표시 문구(통째) | 바꿈 | 창 문서 제목 |
| `app/src/main/onboarding/SKILL.md:12` | If neither works, say doan's guide and presets were not applie | 산문 | 바꿈 | 스킬 스텁 산문 |
| `app/src/main/onboarding/SKILL.md:14` | install or run other doan binaries, or read doan's source fil | 산문 | 바꿈 | 스킬 스텁 산문 |
| `app/src/main/onboarding/SKILL.md:14` | r run other doan binaries, or read doan's source files. | 산문 | 바꿈 | 스킬 스텁 산문 |
| `app/src/main/onboarding/SKILL.md:15` | When the doan app's conversation instructions say | 산문 | 바꿈 | 스킬 스텁 산문 |
| `app/src/main/onboarding/SKILL.md:17` | doan also bundles design presets. The gu | 산문 | 바꿈 | 스킬 스텁 산문 |

결정 메모:
- `index.html`의 `<title>`은 `Doan`이 아니라 `Doan Design`이 되었다. V1에서 메인 창 제목이 페이지 `<title>`을 따른다는 것을 확인했다(바꾸기 전 실제 제목은 `doan`). spec 완료 조건 3의 창 제목 'Doan Design'을 지키려면 `<title>`도 정식 이름이어야 한다(2026-10-30).
- 처음 표에는 `connectionRowView.ts:40`의 `’s doan server runs`가 바꿈으로 있었다. 이 `doan`은 MCP 서버 이름이므로 분류기의 명령어 명사에 `server`를 더하고(fixture `command-server-noun`) 둠으로 옮겼다(2026-10-30).
- `app/src/renderer/Onboarding.tsx`의 Welcome 워드마크 `doan`도 바꾼다. 온보딩 Welcome을 포함하라는 결정(spec)이 가리키는 제품 이름은 이 워드마크뿐이고, 비목표인 '워드마크 디자인'(글꼴·크기·자간)은 바꾸지 않는다.
- `app/src/main/index.ts`의 앱 메뉴 라벨 `doan`은 `Doan`이 된다. macOS는 앱 메뉴 제목을 번들 이름으로 그리므로 화면은 B2의 `productName`이 정한다.
- `thumbnailWindow.ts`의 숨은 창 제목 `doan thumbnails`도 바꾸고, 이를 찾는 `app/runtime/windows.ts`의 상수를 함께 고친다.
- 스텁(`SKILL.md`)을 바꾸면 이미 설치된 공유 스텁은 `differs`가 되어 Settings > Connections가 교체를 묻는다(ARCHITECTURE §6 'Two install paths', 기존 동작).

## 2. CLI·MCP·가이드 — 바꿈 0줄

CLI 문자열 리터럴(MCP 도구 설명 포함)과 가이드 `skill.md`에는 산문 `doan`이 없다. A2 Go 검사는 처음부터 통과했고, 위반을 넣으면 실패하는 것을 변이 시험으로 확인했다(2026-10-30). 남은 소문자는 모두 아래 5절의 둠이다.

## 3. 번들 경로 (`doan.app`, `Contents/MacOS/doan`, `productName`)

| 위치 | 현재 | 판정 | 이유 |
|---|---|---|---|
| `AGENTS.md:73` | - `npm --prefix app run package` — build the versioned arm64 Go CLI and an unsigned local | 바꿈 | 패키지 결과 경로와 실행 파일 `Contents/MacOS/Doan` |
| `AGENTS.md:74` | - `app/dist/mac-arm64/doan.app/Contents/MacOS/doan --user-data-dir=<tmp>` — run the packag | 바꿈 | 패키지 결과 경로와 실행 파일 `Contents/MacOS/Doan` |
| `app/package.json:41` | "productName": "doan", | 바꿈 | 번들 이름 `Doan.app`(사용자 요청 2026-10-30) |
| `app/package.json:44` | "productName": "doan", | 바꿈 | 번들 이름 `Doan.app`(사용자 요청 2026-10-30) |
| `app/src/main/agentAuth/facts.test.ts:5` | const CLI = "/Applications/doan.app/Contents/Resources/bin/doan"; | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/main/cli.test.ts:169` | expect(cliCommand({}, true, "/Applications/doan.app/Contents/Resources")).toBe("/Applica | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/main/conversation/account.test.ts:50` | const prepare = routePrepare(external, createAccountPrepare(auth.runtime, "/Applications | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/main/conversation/account.test.ts:73` | expect(input.env.PATH).toBe("/Applications/doan.app/Contents/Resources/bin:/shell/bin"); | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/main/conversation/account.test.ts:252` | expect(input).toMatchObject({ runtime: provider, args, configDir: h.profile, command: `/ | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/main/onboarding/states.test.ts:120` | expect(isTranslocated("/private/var/folders/a/AppTranslocation/id/d/doan.app")).toBe(t | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/main/onboarding/states.test.ts:121` | expect(isTranslocated("/Applications/AppTranslocation-copy/doan.app")).toBe(false); | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/renderer/connectionRows.test.ts:9` | const app = "/Applications/doan.app/Contents/Resources/bin/doan"; | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/renderer/onboardingView.test.ts:10` | const app = "/Applications/doan.app/Contents/Resources/bin/doan"; | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/renderer/onboardingView.test.ts:189` | const state = ours({ cli: { state: "link-other", value: "/Users/alex/Downloads/doan.ap | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `app/src/renderer/onboardingView.test.ts:190` | expect(confirmView("cli", "claude", state)).toEqual({ title: "Replace the doan link?", | 둠 | 테스트 입력 경로. 번들 안 CLI 경로는 그대로이고 대소문자 무시 볼륨에서 같은 경로 |
| `cli/internal/cli/onboarding_test.go:452` | // fakeBundle lays out <dir>/<name>/Contents like an electron-builder doan.app and returns | 둠 | 가짜 번들. `CFBundleExecutable`과 `MacOS/doan`이 서로 맞고, CLI는 실행 파일 이름을 Info.plist에서 읽는다 |
| `cli/internal/cli/onboarding_test.go:471` | for _, p := range []string{"MacOS/doan", "Resources/bin/doan"} { | 둠 | 가짜 번들. `CFBundleExecutable`과 `MacOS/doan`이 서로 맞고, CLI는 실행 파일 이름을 Info.plist에서 읽는다 |
| `cli/internal/cli/onboarding_test.go:482` | good := fakeBundle(t, dir, "My Apps/doan.app", "design.doan.app") | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:494` | os.Symlink(filepath.Join(dir, "My Apps", "doan.app", "Contents", "MacOS", "doan"), filepa | 둠 | 가짜 번들. `CFBundleExecutable`과 `MacOS/doan`이 서로 맞고, CLI는 실행 파일 이름을 Info.plist에서 읽는다 |
| `cli/internal/cli/onboarding_test.go:512` | viaParent := filepath.Join(dir, "Linked Apps", "doan.app", "Contents", "Resources", "bin" | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:517` | {"bundle with spaces", good, filepath.Join(dir, "My Apps", "doan.app")}, | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:518` | {"link into bundle", linked, filepath.Join(dir, "My Apps", "doan.app")}, | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:527` | {"linked parent folder", viaParent, filepath.Join(dir, "My Apps", "doan.app")}, | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:556` | cli := fakeBundle(t, h.dir, "Doan Apps/doan.app", "design.doan.app") | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:621` | if len(h.launches) != 1 \|\| h.launches[0] != filepath.Join(realPath(t, h.dir), "Doan Apps" | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:806` | "/Applications/doan.app/Contents/Resources/bin/doan":      "/Applications/doan.app/Conte | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:807` | "/Users/me/My Apps/doan.app/Contents/Resources/bin/doan":  "'/Users/me/My Apps/doan.app/ | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:808` | "/Users/me/it's/doan.app/Contents/Resources/bin/doan":     `'/Users/me/it'\''s/doan.app/ | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:809` | "/Users/me/$HOME`x`/doan.app/Contents/Resources/bin/doan": "'/Users/me/$HOME`x`/doan.app | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:819` | cli := fakeBundle(t, dir, "My Apps/doan.app", "design.doan.app") | 둠 | 번들 위치·셸 따옴표 처리용 임의 경로 입력 |
| `cli/internal/cli/onboarding_test.go:874` | for _, s := range []string{"<doan.app>/Contents/Resources/bin/doan onboarding start --jso | 바꿈 | 가이드 문구 단언(가이드가 `<Doan.app>`으로 바뀜) |
| `cli/internal/cli/skill.md:80` | Use these commands when the user asks you to set up Doan. They need the Doan app, but no P | 바꿈 | 가이드의 번들 안내(바이트 수 같음) |
| `cli/internal/cli/skill_test.go:158` | // plain output and the --json envelope, each with the note the app's own CLI appends for | 바꿈 | ARCHITECTURE §6 예산 문단과 함께 `Doan.app`(바이트 수 같음) |
| `cli/internal/cli/skill_test.go:162` | note := len(bundleNote("/Applications/doan.app")) | 바꿈 | ARCHITECTURE §6 예산 문단과 함께 `Doan.app`(바이트 수 같음) |
| `docs/ARCHITECTURE.md:288` | - **Output budget.** The guide and every `doan design-skill` output must fit `skillOutpu | 바꿈 | 현재 구조 문서의 패키지 경로 |
| `docs/ARCHITECTURE.md:313` | - **CLI lookup and local package** (2026-10-24, onboard). `cliCommand(env, app.isPackaged, | 바꿈 | 현재 구조 문서의 패키지 경로 |
| `docs/ARCHITECTURE.md:589` | {"v":1,"ok":false,"error":{"code":"cli_error","reason":"unavailable","message":"The doan C | 바꿈 | 현재 구조 문서의 패키지 경로 |
| `docs/ARCHITECTURE.md:608` | - Current state (2026-10-24, onboard): the only package is the unsigned local arm64 `doan. | 바꿈 | 현재 구조 문서의 패키지 경로 |
| `docs/ARCHITECTURE.md:749` | - **CLI**: real rounds use the packaged CLI (`app/dist/mac-arm64/doan.app/Contents/Resourc | 바꿈 | 현재 구조 문서의 패키지 경로 |
| `docs/DIRECTORY.md:13` | - `app/scripts/package.mjs`: `npm --prefix app run package` — builds the arm64 CLI into `a | 바꿈 | 현재 디렉터리 문서의 패키지 경로 |
| `docs/PRODUCT.md:404` | - Packaged app on the real HOME (onboard task 12, user-authorized real install) — passed a | 둠 | PoC·결정 로그의 과거 기록 |
| `eval/run.ts:22` | const PACKAGED_CLI = join(ROOT, "app/dist/mac-arm64/doan.app/Contents/Resources/bin/doan") | 바꿈 | eval 러너가 패키지 CLI를 찾는 경로 |
| `eval/scenarios/O1/checks.test.ts:45` | [`'/Applications/My Apps/doan.app/Contents/Resources/bin/doan' onboarding check --sess | 둠 | 에이전트 명령 판정용 임의 경로 입력 |
| `schema/fixtures/brand/cases.json:31` | { "name": "path-old-bundle", "text": "<doan.app>/Contents", "expected": [{ "index": 1, | 둠 | 분류기 사례(옛 번들 경로도 경로로 분류) |

번들 안 CLI 경로 `Contents/Resources/bin/doan`, CLI 링크 `~/.local/bin/doan`, MCP 서버 이름 `doan`, userData `~/Library/Application Support/doan`은 바뀌지 않는다(spec '결정').

## 4. 문서 산문 — 55줄 바꿈, 125줄 둠

| 위치 | 현재 문구 | 판정 | 이유 |
|---|---|---|---|
| `AGENTS.md:88` | malmoi `.claude/commands/` to fit doan — the deploy, DB, and translation s | 바꿈 | 현재 문서 산문 |
| `AGENTS.md:104` | fixes, `/ux-audit` reviews) checks doan's own presets with `go run ./cli/cm | 바꿈 | 현재 문서 산문 |
| `AGENTS.md:124` | ow agents fare writing and reading doan designs: the usability loop, the is | 바꿈 | 현재 문서 산문 |
| `README.md:5` | A doan (도안, 圖案) is a drawing made in advan | 둠 | 한국어 낱말 도안(圖案)의 뜻 설명 |
| `docs/ARCHITECTURE.md:139` | lse})` is created, title fixed to “doan thumbnails”, no preload, `sandbox: | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:285` | hell nor MCP works, the agent says doan's guide and presets were not applie | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:285` | t search for, install or run other doan binaries or read doan's source file | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:285` | or run other doan binaries or read doan's source files; the doan app's conv | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:285` | s or read doan's source files; the doan app's conversation instructions win | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:285` | they differ. A last paragraph says doan bundles design presets, that the gu | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:323` | on_exists`, a destination inside a doan project `path_unavailable`), while | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:332` | confirmation also blocks). Nothing doan did not create is overwritten. The | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:419` | Buzz as a reference (PRODUCT §7); doan writes its own CSS. | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:421` | nly literal colours (neutral ramp, doan's `--violet-*` accent ramp, status | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:443` | e writer after its terminal exits; doan never kills it. `resumeTarget` is a | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:447` | ): only detached groups spawned by doan are signalled. OwnedGroup sends SIG | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:491` | ent's tool shell keeps the bundled doan first on PATH \| 0.164.0 \| | 둠 | 번들된 `doan` 명령이나 그 출력·하위 명령을 가리킴 |
| `docs/ARCHITECTURE.md:500` | e not copied. Runs put the bundled doan's directory first on PATH. | 둠 | 번들된 `doan` 명령이나 그 출력·하위 명령을 가리킴 |
| `docs/ARCHITECTURE.md:595` | e providers: when the user names a doan design preset or one clearly fits, | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:595` | ove the command, or ask again once doan runs). No list or body is added by | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:596` | line of the user's text, ``Use the doan design preset `<id>` (<title>).``, | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:682` | and `worktrees` are corresponding doan roots, mapped by the current root's | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:734` | - Walk upward from the doan root to the nearest `.git` marker. | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:736` | ch tree and main using the current doan root's relative directory within it | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:745` | aude Code and Codex write and read doan designs through the shell (CLI) pat | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:757` | ames first, then tool searches and doan output excerpts before deduplicated | 둠 | 번들된 `doan` 명령이나 그 출력·하위 명령을 가리킴 |
| `docs/ARCHITECTURE.md:757` | call id, listing the inner calls (doan subcommands are extracted from full | 둠 | 번들된 `doan` 명령이나 그 출력·하위 명령을 가리킴 |
| `docs/ARCHITECTURE.md:757` | 00-character cap; commands without doan retain their first 200 characters) | 둠 | 번들된 `doan` 명령이나 그 출력·하위 명령을 가리킴 |
| `docs/ARCHITECTURE.md:760` | registration, profile edits, other doan binaries and reads of doan source), | 바꿈 | 현재 문서 산문 |
| `docs/ARCHITECTURE.md:760` | , other doan binaries and reads of doan source), D7b, D10b (MCP `init`), D1 | 바꿈 | 현재 문서 산문 |
| `docs/DESIGN.md:15` | es and rules were read from it and doan wrote its own CSS and TSX. No Buzz | 바꿈 | 디자인 시스템 규칙 산문 |
| `docs/DESIGN.md:32` | ton; Cancel and Escape close every doan dialog. The modal scrim is `bg-scri | 바꿈 | 디자인 시스템 규칙 산문 |
| `docs/DESIGN.md:38` | ### doan adjustments | 바꿈 | 디자인 시스템 규칙 산문 |
| `docs/DESIGN.md:40` | - **Accent ramp.** doan has its own violet ramp, not a refe | 바꿈 | 디자인 시스템 규칙 산문 |
| `docs/DESIGN.md:45` | `. The reference has no such pill; doan keeps it for connection and wizard | 바꿈 | 디자인 시스템 규칙 산문 |
| `docs/DESIGN.md:189` | he draft retain the Unknown title “doan can't tell where this value comes f | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:331` | ns', 'Connection storage failed', 'doan tools check failed', 'Multiple loca | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:332` | own footer: Back, Continue / Open doan / Use this folder / Retry, 40 high, | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:335` | n 'Connection storage failed' and 'doan tools check failed' the draft's Bac | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:362` | - **Clone destination inside a doan project** (D26, 2026-10-29). Main r | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:362` | says "This location is inside the doan project <name>. Choose a location o | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:470` | the reason under "Agents can’t run doan until the command is connected."; a | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:470` | <Agent> is installed but can’t use doan yet." with the reason under it. Pin | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:530` | I and preset ("the doan CLI", "the doan design preset"); onboarding mixes " | 바꿈 | 표기 혼재 기록에 해결(doan-naming) 표시 |
| `docs/DESIGN.md:530` | preset"); onboarding mixes "Set up doan" / "Open doan" with "update Doan". | 바꿈 | 표기 혼재 기록에 해결(doan-naming) 표시 |
| `docs/DESIGN.md:530` | arding mixes "Set up doan" / "Open doan" with "update Doan". No decision fi | 바꿈 | 표기 혼재 기록에 해결(doan-naming) 표시 |
| `docs/DESIGN.md:610` | bar × is named “Remove <name> from doan.” (Superseded 2026-10-25: the sideb | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:721` | x / 1fr; Cancel focused \| "Fix the doan link?" and "Add to serve?" share th | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:746` | ard \| `heading` "Finish setting up doan"; `button` "Settings › Connections" | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:750` | irmations \| `alertdialog` "Fix the doan link?", "Add to serve?" \| | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:758` | t confirmations other than Fix the doan link?, the "It changed after you lo | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DESIGN.md:1063` | d behavior probes preserved actual doan registration/configuration/session | 둠 | 구현 시점 측정 기록과 측정한 문구 인용 |
| `docs/DIRECTORY.md:33` | doan/canvases/`: draft canvases of doan's own UI (`app-shell.html`, `select | 바꿈 | 현재 문서 산문 |
| `docs/POSTMORTEM.md:8` | — Codex cut the middle out of the doan guide and kept its end marker, so p | 둠 | 증상 인용·과거 기록 |
| `docs/POSTMORTEM.md:38` | irect shows a code to paste, which doan has no way to accept, and launched | 둠 | 증상 인용·과거 기록 |
| `docs/POSTMORTEM.md:38` | a second, localhost-callback link. doan routed only the printed link to the | 둠 | 증상 인용·과거 기록 |
| `docs/POSTMORTEM.md:402` | - **Symptom**: while Fix the doan link? was open, Home requested Proj | 둠 | 증상 인용·과거 기록 |
| `docs/POSTMORTEM.md:561` | - **Symptom**: choosing Set Up doan… after Cmd+W revealed the window bu | 둠 | 증상 인용·과거 기록 |
| `docs/POSTMORTEM.md:564` | check: `openWizard` and the Set Up doan… menu item were removed in `d13e3c7 | 둠 | 증상 인용·과거 기록 |
| `docs/PRODUCT.md:110` | Start a new <agent> session to use doan." | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:111` | 1 and 2 never overwrite something doan did not create. Only a symlink, a ` | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:113` | w uses an ellipsis. Input stays in doan until copied; no agent is launched. | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:115` | ation before Fix. A Claude link to doan's own missing shared stub is Not co | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:115` | priate; translocation asks to move doan to Applications. Writes retain the | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:117` | banner and the “Finish setting up doan” checklist: a missing project shows | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:125` | , Project Settings and Remove from doan. Worktree selection restores that r | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:125` | ting transition guard. Remove from doan removes every registered worktree i | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:128` | - Remove from doan (sidebar project menu) and Settings | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:164` | "`, no source line). Unknown means doan cannot determine the source; CDP ca | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:203` | · 1 resolved.** Not a canvas ID — doan can't show or change these comments | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:259` | `buzz-restyle` (parent) \| Restyle doan with Buzz (block/buzz-app) as the r | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:260` | palette → roles → legacy aliases), doan's violet accent, `themeSource` ligh | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:268` | ### Dogfooding: doan's UI drafts live in doan (2026-10-2 | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:268` | gfooding: doan's UI drafts live in doan (2026-10-21) | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:270` | - Design drafts for the doan app UI are kept as canvases in this | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:270` | and viewed and commented on in the doan app. Whether the implementation mat | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:271` | - Order: build doan's canvas features before UI design | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:274` | - Why: apply the problem doan aims to solve (design drafts live o | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:274` | afts live outside the code, §1) to doan itself first to verify it. Standalo | 바꿈 | 현재 제품 문서 산문 |
| `docs/PRODUCT.md:318` | NTIME`, all five signed in through doan's agent-auth with logins approved b | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:322` | the next turn's `session/load`, in doan's one-server-per-turn runner, repor | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:323` | and `stopReason: end_turn`, which doan shows as a normal reply and `turn.d | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:324` | ncelled by user`, then `end_turn`; doan emitted `permission.resolved deny`, | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:325` | request and 50 MB paste limits are doan's own and nothing here contradicts | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:330` | s kills were used). Keychain items doan created were removed and the extern | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:330` | aseline; differences not caused by doan are recorded in the evidence. | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:347` | lt files. No production code, real doan app, or real agent session was used | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:350` | t, screenshot pixels or production doan's reload pipeline. Values below are | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:359` | te cleanup after daemon stop. Real doan's complete userData tree, CLI/skill | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:402` | l tree, Claude skill link and real doan userData were absent; `doan` MCP ke | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:409` | OAuth refresh; contents not read); doan state, skills, settings and MCP reg | 둠 | §6 PoC 관찰 기록 |
| `docs/PRODUCT.md:423` | tion” banner or “Finish setting up doan” checklist, and launch announces no | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:432` | sen preset adds the line ``Use the doan design preset `<id>` (<title>).``, | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:445` | This repo's development skills use doan's design presets: design work in `/ | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:445` | S.md 'Workflow') \| User decision — doan's own design work dogfoods the pres | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:458` | \| 2026-10-29 \| doan is licensed under Apache-2.0; the r | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:469` | ne destination inside a registered doan project shows "This location is ins | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:469` | shows "This location is inside the doan project <name>. Choose a location o | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:474` | but publish only presets that fit doan, merging duplicate aliases and leav | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:569` | \| 2026-10-21 \| Dogfooding: doan's UI drafts as canvases in this rep | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:651` | 2026-10-26 by buzz-ds: light only, doan's violet accent)  (Relevant shell/t | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:665` | ement a Claude-drawn draft through doan alone \| | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:698` | ing, Cmd+Q does not count; "Set Up doan…" in the app menu reopens it \| User | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:702` | I with the step 1 link as command; doan never writes agent config files its | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:707` | 0-24 \| Setup never overwrites what doan did not create; only a symlink, a ` | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:713` | \| 2026-10-24 \| "Set Up doan…" with the wizard already open (vis | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:733` | \| 2026-10-24 \| doan's read-only MCP tools (`ls`, `comme | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:737` | for the target or suggest "Set Up doan…" when neither shell socket nor MCP | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:738` | te; after three rounds with no new doan usability issue the suite serves as | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:745` | ome: R2: find Git above a monorepo doan root and map its relative directory | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:756` | bar × is named “Remove <name> from doan” (removed by design-nav on 2026-10- | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:811` | 0-25 \| app-setup: A Claude link to doan’s own missing shared stub is Not co | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:881` | bric. `command doan …` counts as a doan invocation in transcripts \| Conduct | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:898` | es are read from a local clone and doan writes its own code; no Buzz files, | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:898` | license copies or brand assets in doan; the reference is recorded only her | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:898` | e light shell, panels and controls doan lacks; copying code would bring lic | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:898` | would bring licence and structure doan does not own \| | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:902` | 026-10-26 \| buzz-ds: the accent is doan's own violet ramp (step 9 `#973be1` | 둠 | §7 결정 로그의 옛 줄 |
| `docs/PRODUCT.md:902` | buzz-ds) — compared eight ramps on doan's accent places; violet stays apart | 둠 | §7 결정 로그의 옛 줄 |
| `docs/USABILITY-EVAL.md:3` | agents struggle to write and read doan designs (2026-10-24 user). Bugs and | 바꿈 | 루프 설명 산문 |
| `docs/USABILITY-EVAL.md:7` | where an agent stalls while we use doan ourselves (dogfooding). | 바꿈 | 루프 설명 산문 |
| `docs/USABILITY-EVAL.md:19` | tributed to the runs (no runner or doan code touches the keychain; unverifi | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:22` | nial remains (Codex's sandbox, not doan), so R2 with doan MCP off still fai | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:22` | Codex searched its tool list for a doan `active` tool and found none); with | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:22` | nial and an `ALL_TOOLS` search for doan returning `[]`. hard1 (2026-10-24): | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:23` | 0-24 \| agent-eval loop1 \| output \| doan's MCP tools declare no annotations, | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:23` | annotations, so Codex treats every doan tool as one that needs approval. Un | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:23` | approval_mode="approve"` also lets doan `skill` complete. loop2 (2026-10-24 | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:29` | arding-261029 \| eval runner (not a doan issue) \| The eval fake app answered | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:31` | Another Codex run gave only "make doan available". \| D4: Claude 1/1 pass ( | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:31` | ns, do not search for or run other doan binaries or sources); re-measure wi | 둠 | 이슈 표의 관찰 기록 |
| `docs/USABILITY-EVAL.md:43` | `keychain:provider-items` change; doan keys unchanged. \| | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:45` | `keychain:provider-items` change (doan keys unchanged). See 'Final round'. | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:48` | items` change as the first rounds; doan keys unchanged. \| | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:49` | ain:provider-items` changed again; doan keys unchanged. \| | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:51` | advice and an off-repo search for doan (U-010). Real-state unchanged. \| | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:55` | change (see D1–D12 section); every doan key was unchanged. \| | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:60` | claude, a shell glob error) is not doan's. \| | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:61` | no approval setting), so this is a doan problem, not a runner defect. New r | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:61` | d carry a short output excerpt per doan invocation. Agent-side noise, not d | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:61` | invocation. Agent-side noise, not doan's: W1-codex replaced `16px` with `v | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:62` | _TOOLS.filter(...)` searches for a doan `active` tool (all returned `[]`) a | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:62` | ng verdict). Agent-side noise, not doan's: R5-codex again printed the whole | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:63` | not misled). Agent-side noise, not doan's: W1-codex's generator hit a Pytho | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:65` | duplicate main landmarks without a doan warning. Empty-input behavior is pi | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:66` | eir agent resolve events; no shell doan invocation. One verification retry | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:69` | ce` passes in all 38 runs). No new doan usability issue. **H1** (both pass) | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:69` | completed)`. Agent-side noise, not doan's: Codex's async question tool asks | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:70` | ce` passes in all 38 runs). No new doan usability issue. **H3 re-measure** | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:70` | a rubric (scenario) defect, not a doan issue, and Codex's in-repo install | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:70` | guity above. Agent-side noise, not doan's: R1b-claude repeated `mcp__doan__ | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:71` | ce` passes in all 38 runs). No new doan usability issue; `summary.md` lists | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:71` | ow as ~10 s per model turn with no doan error. Judge layer labels for the k | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:71` | ame verdict. Agent-side noise, not doan's: H1-codex and H2-codex ask throug | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:72` | ario documentation mismatch, not a doan issue:** R5's rubric names `web/bil | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:74` | build of the design"; it is not a doan problem (see the repeat). Rubric/ch | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:74` | epeat). Rubric/checker note, not a doan issue: R5's rubric still names `web | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:75` | dging in the final explanation, no doan fix follows; the earlier rounds pas | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:77` | earlier judge-only partial. No new doan issue or judge-only partial. Agent- | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:79` | 14 provenance checks pass. No new doan issue or judge-only partial. Limite | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:80` | l followed by MCP `active`. No new doan issue row. Evidence: `.scratch/agen | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:82` | appended one agent resolve. No new doan issue row; see the R6b note below. | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:84` | vocation check (see below). No new doan issue row. Dates here use KST; runn | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:86` | edential (02:10:51Z), unrelated to doan. Evidence: `.scratch/agent-eval/buz | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:109` | connect this agent in Doan (Set Up doan…)"; all three runs search for an ac | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:119` | fication: a scenario defect, not a doan usability issue, so no issue row. T | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:127` | e it specific to this screen"). No doan usability issue or runner defect wa | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:131` | app's copied instruction (it names doan, limits resolves to the listed comm | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:149` | ent-file` to the hash of an absent doan key because Claude first created it | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:149` | porary config. It did not register doan. Repeats used that initialized temp | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:157` | l. Agent-side detours were not new doan issues: H1/H2/H7 Codex asked asynch | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:157` | r judge_error occurred, and no new doan issue row is justified by these run | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:182` | its contents were not read. All 25 doan, MCP-registration and auth-file key | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:182` | eported the keychain unchanged. No doan state was touched. | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:188` | t search for, install or run other doan binaries or read doan's source file | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:188` | or run other doan binaries or read doan's source files), the `document` bod | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:188` | tion, shell profile edits, another doan binary or `go run`/`go build` of `c | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:188` | build` of `cmd/doan`, and reads of doan source files, including Claude's Re | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:200` | "links". Neither D11c result is a doan defect. | 둠 | 라운드 기록 |
| `docs/USABILITY-EVAL.md:233` | fference is a scenario note, not a doan issue; the rubric is unchanged. | 둠 | 라운드 기록 |

## 5. 둠 — 범주별

### 5.1 코드 문자열의 명령어·경로·식별자 (파일별 개수)

| 분류 | 파일 | 개수 |
|---|---|---|
| 명령어 | `app/src/comments/draft.ts` | 1 |
| 명령어 | `app/src/comments/panelText.ts` | 3 |
| 명령어 | `app/src/comments/projection.ts` | 2 |
| 명령어 | `app/src/firstPrompt/promptSentence.ts` | 1 |
| 명령어 | `app/src/main/configBridge.ts` | 2 |
| 명령어 | `app/src/main/conversation/prompt.ts` | 7 |
| 명령어 | `app/src/main/designSkills.ts` | 4 |
| 명령어 | `app/src/main/folderState.ts` | 1 |
| 명령어 | `app/src/main/onboarding/machine.ts` | 1 |
| 명령어 | `app/src/main/view.ts` | 2 |
| 명령어 | `app/src/renderer/App.tsx` | 1 |
| 명령어 | `app/src/renderer/CanvasController.ts` | 1 |
| 명령어 | `app/src/renderer/CommentsPanel.tsx` | 2 |
| 명령어 | `app/src/renderer/ConnectionRows.tsx` | 1 |
| 명령어 | `app/src/renderer/ProjectOverview.tsx` | 2 |
| 명령어 | `app/src/renderer/Sidebar.tsx` | 2 |
| 명령어 | `app/src/renderer/canvasView.ts` | 3 |
| 명령어 | `app/src/renderer/connectionRowView.ts` | 14 |
| 명령어 | `app/src/renderer/feedbackGroups.ts` | 1 |
| 명령어 | `app/src/renderer/homeComposer.ts` | 4 |
| 명령어 | `app/src/renderer/onboardingView.ts` | 4 |
| 명령어 | `app/src/main/onboarding/SKILL.md` | 7 |
| 경로 | `app/src/comments/panelText.ts` | 1 |
| 경로 | `app/src/formats/types.ts` | 2 |
| 경로 | `app/src/main/agentAuth/providers.ts` | 2 |
| 경로 | `app/src/main/cli.ts` | 1 |
| 경로 | `app/src/main/comments/files.ts` | 2 |
| 경로 | `app/src/main/comments/mkdir-child.ts` | 1 |
| 경로 | `app/src/main/comments/mkdir.ts` | 1 |
| 경로 | `app/src/main/conversation/acp.ts` | 1 |
| 경로 | `app/src/main/conversation/store.ts` | 1 |
| 경로 | `app/src/main/conversation/transport.ts` | 1 |
| 경로 | `app/src/main/designChange.ts` | 1 |
| 경로 | `app/src/main/onboarding/machine.ts` | 3 |
| 경로 | `app/src/main/onboarding/projects.ts` | 4 |
| 경로 | `app/src/main/onboarding/service.ts` | 2 |
| 경로 | `app/src/main/thumbnails.ts` | 1 |
| 경로 | `app/src/main/watch.ts` | 9 |
| 경로 | `app/src/renderer/App.tsx` | 2 |
| 경로 | `app/src/renderer/ProjectOverview.tsx` | 1 |
| 경로 | `app/src/renderer/ProjectSetupDialog.tsx` | 2 |
| 경로 | `app/src/renderer/Sidebar.tsx` | 1 |
| 경로 | `app/src/renderer/canvasTree.ts` | 3 |
| 경로 | `app/src/renderer/connectionRowView.ts` | 1 |
| 경로 | `app/src/renderer/firstPromptView.ts` | 1 |
| 경로 | `app/src/renderer/onboardingView.ts` | 2 |
| 경로 | `app/src/renderer/projectRow.ts` | 2 |
| 경로 | `app/src/renderer/quickOpen.ts` | 1 |
| 경로 | `app/src/renderer/settingsProjects.tsx` | 1 |
| 식별자 | `app/src/comments/panelText.ts` | 1 |
| 식별자 | `app/src/comments/targetLabel.ts` | 1 |
| 식별자 | `app/src/main/agentAuth/antigravity.ts` | 1 |
| 식별자 | `app/src/main/agentAuth/facts.ts` | 1 |
| 식별자 | `app/src/main/agentAuth/manager.ts` | 20 |
| 식별자 | `app/src/main/agentAuth/metadata.ts` | 1 |
| 식별자 | `app/src/main/agentAuth/types.ts` | 1 |
| 식별자 | `app/src/main/canvasScript.ts` | 22 |
| 식별자 | `app/src/main/cli.ts` | 1 |
| 식별자 | `app/src/main/comments/document.ts` | 1 |
| 식별자 | `app/src/main/configBridge.ts` | 1 |
| 식별자 | `app/src/main/conversation/acpRunner.ts` | 1 |
| 식별자 | `app/src/main/conversation/dispatcher.ts` | 1 |
| 식별자 | `app/src/main/conversation/models.ts` | 1 |
| 식별자 | `app/src/main/conversation/prepare.ts` | 4 |
| 식별자 | `app/src/main/conversation/runners.ts` | 1 |
| 식별자 | `app/src/main/conversation/service.ts` | 5 |
| 식별자 | `app/src/main/conversation/store.ts` | 2 |
| 식별자 | `app/src/main/designSkills.ts` | 1 |
| 식별자 | `app/src/main/index.ts` | 6 |
| 식별자 | `app/src/main/inspector.ts` | 6 |
| 식별자 | `app/src/main/onboarding/clone.ts` | 1 |
| 식별자 | `app/src/main/onboarding/machine.ts` | 2 |
| 식별자 | `app/src/main/onboarding/service.ts` | 1 |
| 식별자 | `app/src/main/onboarding/states.ts` | 5 |
| 식별자 | `app/src/main/reviewState.ts` | 2 |
| 식별자 | `app/src/main/runtime.ts` | 3 |
| 식별자 | `app/src/main/shell.ts` | 1 |
| 식별자 | `app/src/main/thumbnails.ts` | 1 |
| 식별자 | `app/src/main/uiState.ts` | 2 |
| 식별자 | `app/src/main/watch.ts` | 2 |
| 식별자 | `app/src/preload/index.ts` | 1 |
| 식별자 | `app/src/renderer/AddProjectsDialog.tsx` | 19 |
| 식별자 | `app/src/renderer/AlertIcon.tsx` | 1 |
| 식별자 | `app/src/renderer/App.tsx` | 18 |
| 식별자 | `app/src/renderer/CommentsPanel.tsx` | 41 |
| 식별자 | `app/src/renderer/ConnectionRows.tsx` | 2 |
| 식별자 | `app/src/renderer/ConversationStripView.tsx` | 4 |
| 식별자 | `app/src/renderer/ErrorDetails.tsx` | 1 |
| 식별자 | `app/src/renderer/FeedbackPanel.tsx` | 11 |
| 식별자 | `app/src/renderer/FirstPrompt.tsx` | 4 |
| 식별자 | `app/src/renderer/HandOffDialog.tsx` | 14 |
| 식별자 | `app/src/renderer/Home.tsx` | 2 |
| 식별자 | `app/src/renderer/HomeComposerView.tsx` | 56 |
| 식별자 | `app/src/renderer/Onboarding.tsx` | 71 |
| 식별자 | `app/src/renderer/ProjectOverview.tsx` | 1 |
| 식별자 | `app/src/renderer/ProjectSetupDialog.tsx` | 9 |
| 식별자 | `app/src/renderer/QuickOpenDialog.tsx` | 1 |
| 식별자 | `app/src/renderer/ReviewBar.tsx` | 8 |
| 식별자 | `app/src/renderer/RightPanel.tsx` | 3 |
| 식별자 | `app/src/renderer/SettingsDialog.tsx` | 5 |
| 식별자 | `app/src/renderer/ShellSidebar.tsx` | 13 |
| 식별자 | `app/src/renderer/Sidebar.tsx` | 2 |
| 식별자 | `app/src/renderer/Toast.tsx` | 3 |
| 식별자 | `app/src/renderer/components/ui/tooltip.tsx` | 1 |
| 식별자 | `app/src/renderer/onboardingView.ts` | 1 |
| 식별자 | `app/src/renderer/settingsProjects.tsx` | 6 |
| 식별자 | `app/src/renderer/settingsWindow.tsx` | 4 |
| 경로 | `cli/cmd/doan/main.go` | 1 |
| 경로 | `cli/internal/check/check.go` | 5 |
| 경로 | `cli/internal/cli/active.go` | 1 |
| 경로 | `cli/internal/cli/check.go` | 3 |
| 경로 | `cli/internal/cli/config.go` | 3 |
| 경로 | `cli/internal/cli/config_ops.go` | 1 |
| 경로 | `cli/internal/cli/design_skill.go` | 1 |
| 경로 | `cli/internal/cli/init.go` | 14 |
| 경로 | `cli/internal/cli/mcp.go` | 1 |
| 경로 | `cli/internal/cli/onboarding.go` | 1 |
| 경로 | `cli/internal/cli/read.go` | 3 |
| 경로 | `cli/internal/cli/resolve.go` | 2 |
| 경로 | `cli/internal/cli/run.go` | 3 |
| 경로 | `cli/internal/cli/sessions.go` | 2 |
| 경로 | `cli/internal/comments/resolve.go` | 1 |
| 경로 | `cli/internal/formats/validate.go` | 2 |
| 경로 | `cli/internal/repo/config.go` | 1 |
| 경로 | `cli/internal/repo/files.go` | 6 |
| 경로 | `cli/internal/repo/find.go` | 2 |
| 경로 | `cli/internal/repo/orphans.go` | 1 |
| 경로 | `cli/internal/repo/scope.go` | 11 |
| 식별자 | `cli/internal/canvas/canvas.go` | 7 |
| 식별자 | `cli/internal/check/check.go` | 2 |
| 식별자 | `cli/internal/cli/mcp.go` | 2 |
| 식별자 | `cli/internal/cli/onboarding.go` | 2 |
| 식별자 | `cli/internal/cli/run.go` | 2 |
| 식별자 | `cli/internal/cli/sessions.go` | 1 |
| 식별자 | `cli/internal/cli/skill.go` | 2 |
| 식별자 | `cli/internal/designskill/designskill.go` | 1 |
| 명령어 | `cli/internal/check/check.go` | 1 |
| 명령어 | `cli/internal/cli/active.go` | 1 |
| 명령어 | `cli/internal/cli/design_skill.go` | 1 |
| 명령어 | `cli/internal/cli/init.go` | 3 |
| 명령어 | `cli/internal/cli/mcp.go` | 18 |
| 명령어 | `cli/internal/cli/onboarding.go` | 9 |
| 명령어 | `cli/internal/cli/read.go` | 1 |
| 명령어 | `cli/internal/cli/resolve.go` | 1 |
| 명령어 | `cli/internal/cli/run.go` | 3 |
| 명령어 | `cli/internal/cli/skill.go` | 1 |
| 명령어 | `cli/internal/cli/skill.md` | 83 |

### 5.2 범위 밖 텍스트 (산문 `doan` 개수)

- 코드 주석과 테스트 이름: 비목표(spec). 단언하는 문구만 바뀐 문구를 따른다.
- 개발 스킬 `.agents/skills/`: 이 저장소 개발용이고 제품 사용자가 읽지 않는다(design §1 범위 밖). `.agents/skills/agent-eval/SKILL.md` 4, `.agents/skills/audit/SKILL.md` 2, `.agents/skills/code-review/SKILL.md` 2, `.agents/skills/design-draft/SKILL.md` 5, `.agents/skills/design-sync/SKILL.md` 3, `.agents/skills/doc-check/SKILL.md` 2, `.agents/skills/ux-audit/SKILL.md` 2, `.agents/skills/verify/SKILL.md` 2
- eval 시나리오의 프롬프트·루브릭·기록 transcript: 고정 입력과 과거 기록이다. 바꾸면 라운드끼리 비교가 깨진다. `eval/scenarios/D1/presets.ts` 2, `eval/scenarios/D10b/prompt.md` 1, `eval/scenarios/D10b/rubric.md` 3, `eval/scenarios/D2/prompt.md` 1, `eval/scenarios/D2b/prompt.md` 1, `eval/scenarios/D3/prompt.md` 1, `eval/scenarios/D3/rubric.md` 1, `eval/scenarios/D3b/prompt.md` 1, `eval/scenarios/D3b/rubric.md` 4, `eval/scenarios/D3b/scenario.json` 1, `eval/scenarios/D4/checks.ts` 1, `eval/scenarios/D4/fixtures/fail.transcript.txt` 2, `eval/scenarios/D4/fixtures/pass.transcript.txt` 1, `eval/scenarios/D4/prompt.md` 1, `eval/scenarios/D4/rubric.md` 5, `eval/scenarios/D4b/checks.ts` 1, `eval/scenarios/D4b/fixtures/fail.transcript.txt` 1, `eval/scenarios/D4b/fixtures/pass.transcript.txt` 1, `eval/scenarios/D4b/prompt.md` 1, `eval/scenarios/D4b/rubric.md` 7, `eval/scenarios/H3/prompt.md` 1, `eval/scenarios/H5/checks.ts` 1, `eval/scenarios/H7/rubric.md` 1, `eval/scenarios/O1/checks.test.ts` 10, `eval/scenarios/O1/log.ts` 2, `eval/scenarios/R1b/prompt.md` 1, `eval/scenarios/_example/checks.ts` 2, `eval/scenarios/_example/fixtures/fail/.doan/canvases/hello.html` 1, `eval/scenarios/_example/fixtures/pass/.doan/canvases/hello.html` 1, `eval/scenarios/_example/prompt.md` 1, `eval/scenarios/audit.test.ts` 1
- eval 러너 내부 문구(judge 프롬프트, transcript 요약): 제품 출력이 아니다. `eval/lib/agent.test.ts` 2, `eval/lib/context.ts` 1, `eval/lib/isolate.test.ts` 1, `eval/lib/judge.test.ts` 1, `eval/lib/judge.ts` 4, `eval/lib/transcript.test.ts` 4, `eval/lib/transcript.ts` 4, `eval/lib/types.ts` 1, `eval/lib/workspace.ts` 1
- `app/runtime/` 지원 코드: `windows.ts`의 창 제목 상수만 1절과 함께 바꾸고, `real-state.ts`의 주석은 둔다.
- 초안 캔버스 `.doan/canvases/`: 과거 초안 기록이고 정본은 구현이다(design §1). `.doan/canvases/app-setup.html` 84, `.doan/canvases/app-shell.html` 9, `.doan/canvases/buzz-ds.html` 22, `.doan/canvases/buzz-onboarding.html` 120, `.doan/canvases/buzz-shell.html` 4, `.doan/canvases/comments-ui.html` 2, `.doan/canvases/design-nav.html` 2, `.doan/canvases/onboard.html` 23, `.doan/canvases/project-feedback.html` 4, `.doan/canvases/projects-home.html` 21, `.doan/canvases/revision-continuity.html` 1, `.doan/canvases/revision-recheck.html` 1, `.doan/canvases/select-inspect.html` 11
