# 프렙 카페 — EPIC 1·2

판매·메뉴 수익성 조회, 판매와 비용 추가·수정·삭제, 하루 마감, 일·월 손익, 실제 브라우저 저장과 JSON 백업을 구현했다. EPIC 1은 사용자 확인을 마쳤고, EPIC 2는 자체 검사 후 사용자 확인을 기다린다. 재고 등록·복원 화면은 EPIC 3의 범위다.

## 사용

테스트 주소는 **http://127.0.0.1:4173/** 이다. Codex의 테스트용 브라우저가 열려 있다. 기록은 그 브라우저 프로필 안에 저장되므로 같은 브라우저와 같은 주소로 접속한다. 원본 data 폴더는 변경하지 않는다.

서버를 다시 실행해야 하는 경우, 이 프로젝트 폴더에서 Node.js로 `server.mjs`를 실행한다. 이 기기의 확인된 실행 환경은 Node.js v24.19.0이다.

```powershell
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' server.mjs
```

4173 주소가 이미 사용 중이면 다른 주소로 자동 변경하지 않는다. 브라우저 기록을 삭제하거나 다른 프로필·다른 주소로 이동하면 기존 기록이 보이지 않을 수 있다. **자료 백업 → 백업 파일 내려받기**로 마지막 저장자료를 보관한다. 백업에는 미저장 입력이 포함되지 않는다. 복원은 EPIC 3에서 제공한다.

손익은 마감된 날짜의 순매출에서 판매 관련 비용과 실제 운영비를 뺀 금액이다. 비용 변경·삭제 후 해당 날짜를 다시 마감한다. 비용 기록이 없는 완료일은 비용 미입력으로 표시하고 손익 판정을 보류한다. 실제 비용 0원은 0원 비용 기록으로 구분한다. 재고 손실 금액은 아직 손익에 반영하지 않는다.

## Vercel 배포

Vercel에서는 로컬 전용 `server.mjs`를 실행하지 않는다. `vercel.json`이 `framework: null`(Other), 빌드 명령 `node build.mjs`, 출력 폴더 `dist`를 지정한다. 프로젝트 Root Directory는 저장소 루트다. `npm run build`로 화면·동작·스타일·아이콘과 가상 샘플 JSON만 준비한다. 작업 문서·원본 엑셀·개발용 서버 코드는 공개 파일에 포함하지 않는다.

기존 배포의 `Forbidden`은 로컬 전용 서버가 Vercel 도메인을 거부해서 발생했다. 주소 제한을 제거하는 대신 Vercel이 생성된 정적 파일을 직접 제공하도록 변경했다. 연결된 GitHub 자동 배포가 켜져 있으면 main 푸시 후 재배포된다. 자동 배포가 없다면 최신 커밋으로 새 배포를 실행해야 한다. 기존 커밋의 재배포만 반복하면 수정이 반영되지 않는다.

웹 주소로 접속해도 기록은 각 브라우저 내부에 저장된다. localhost와 Vercel 주소는 서로 다른 저장소를 사용하므로 로컬 테스트 기록이 자동으로 이동하지 않는다. 새 주소에서 처음 접속하면 가상 샘플로 시작한다. 백업 파일 보관은 가능하며 복원 기능은 EPIC 3의 범위다.

## 검사

계산·변경 로직 검사:

```powershell
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/core.test.mjs tests/epic2-core.test.mjs
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/deployment.test.mjs
```

실제 브라우저·저장소 검사(로컬 서버 실행 필요):

```powershell
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tests/browser.test.mjs
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tests/epic2-browser.test.mjs
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tests/deployment-browser.mjs
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tests/deployment-live.mjs
```

브라우저 검사는 설치된 Edge와 이 기기의 번들 Playwright를 사용하며 별도의 검사용 프로필에서 실행한다. 검사 전용 자료는 사용자 테스트 브라우저와 분리된다. EPIC 2 결과는 `tests/results/epic2-browser.json`, EPIC 1 회귀 결과는 `tests/results/epic1-regression.json`에 기록했다. 다른 환경에서는 `CAFE_PLAYWRIGHT` 환경 변수에 Playwright 모듈 경로를 지정할 수 있다.

사용자 확인은 [테스트결과](docs/05_테스트결과.md)에 기록한다. 사용자의 문제없는 확인 전에는 EPIC을 완료로 표시하지 않는다.
