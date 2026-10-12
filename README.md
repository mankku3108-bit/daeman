# 프렙 카페 — EPIC 1

현재 구현 범위는 판매·메뉴 수익성 조회, 판매 추가·수정·삭제, 하루 마감과 실제 브라우저 저장이다. 비용 관리·매장 손익·백업·재고 등록·복원 화면은 구현하지 않았다.

## 사용

테스트 주소는 **http://127.0.0.1:4173/** 이다. Codex의 테스트용 브라우저가 열려 있다. 기록은 그 브라우저 프로필 안에 저장되므로 같은 브라우저와 같은 주소로 접속한다. 원본 data 폴더는 변경하지 않는다.

서버를 다시 실행해야 하는 경우, 이 프로젝트 폴더에서 Node.js로 `server.mjs`를 실행한다. 이 기기의 확인된 실행 환경은 Node.js v24.19.0이다.

```powershell
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' server.mjs
```

4173 주소가 이미 사용 중이면 다른 주소로 자동 변경하지 않는다. 브라우저 기록을 삭제하거나 다른 프로필·다른 주소로 이동하면 기존 기록이 보이지 않을 수 있다. 수동 백업 기능은 다음 EPIC의 범위다.

## 검사

계산·변경 로직 검사:

```powershell
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/core.test.mjs
```

실제 브라우저·저장소 검사(로컬 서버 실행 필요):

```powershell
& 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tests/browser.test.mjs
```

브라우저 검사는 설치된 Edge와 이 기기의 번들 Playwright를 사용하며 별도의 검사용 프로필에서 실행한다. 검사 전용 자료는 사용자 테스트 브라우저와 분리된다. 결과는 `.test-output/browser-results.json`에 기록한다. 다른 환경에서는 `CAFE_PLAYWRIGHT` 환경 변수에 Playwright 모듈 경로를 지정할 수 있다.

사용자 확인은 [테스트결과](docs/05_테스트결과.md)에 기록한다. 사용자의 문제없는 확인 전에는 EPIC을 완료로 표시하지 않는다.
