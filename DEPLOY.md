# 인터넷 공개 서버 배포

현재 게임은 웹 화면과 Socket.IO 서버를 하나의 Node.js 서비스로 실행합니다. 공개 서버에 배포하면 로컬 PC를 켜두지 않아도 다른 네트워크의 친구와 같은 HTTPS 주소로 플레이할 수 있습니다. 정적 사이트가 아닌 **Web Service**로 배포해야 합니다.

## 개인 서버 (wodnjs.com/omok)

지금 운영은 집 서버 한 대에서 `127.0.0.1:8081`로 돌리고, Cloudflare 터널이 `wodnjs.com/omok`을 이곳으로 넘깁니다. 설치는 홈페이지 묶음의 `install-web.sh`가 합니다(전용 계정 `webgames`, systemd `web-omok`).

```sh
npm ci --include=dev
BASE_PATH=/omok npm run build
BASE_PATH=/omok HOST=127.0.0.1 PORT=8081 OMOK_DATA_DIR=/var/lib/webgames/omok INTERNAL_TOKEN=... npm start
```

로그인은 홈페이지 서버(8080)가 맡으므로 홈페이지 서버가 같은 컴퓨터에서 돌고 있어야 합니다. 환경 변수 설명은 [README](./README.md#개인-서버에서-경로-아래로-실행-wodnjscomomok)를 보세요.

## Docker를 지원하는 서버

```sh
docker build -t omok-sai .
docker run --rm -p 3001:3001 omok-sai
```

Dockerfile은 화면과 TypeScript 서버를 빌드하고, 운영 이미지에서는 Node.js로 컴파일된 서버를 실행합니다. 역방향 프록시를 사용하면 `/socket.io`의 WebSocket 업그레이드를 허용하세요. 웹 화면과 실시간 서버를 같은 공개 도메인으로 제공합니다.

## 운영 실행 확인

```powershell
npm ci --include=dev
npm run build
$env:PORT = '3001'
npm start
```

`/api/health`가 HTTP 200과 `ok: true`를 반환하는지, JavaScript/CSS/바둑판 파일이 로드되는지, 다른 세션 두 개 이상에서 실제 돌과 채팅이 동기화되는지 확인합니다.
