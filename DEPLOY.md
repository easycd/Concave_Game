# 인터넷 공개 서버 배포

현재 게임은 웹 화면과 Socket.IO 서버를 하나의 Node.js 서비스로 실행합니다. 공개 서버에 배포하면 로컬 PC를 켜두지 않아도 다른 네트워크의 친구와 같은 HTTPS 주소로 플레이할 수 있습니다. 정적 사이트가 아닌 **Web Service**로 배포해야 합니다.

## Render

`render.yaml`에 무료 Node.js 서버, 싱가포르 지역, 실행 명령 및 상태 확인 경로가 준비되어 있습니다. 현재 공개 게임 주소는 [https://omok-sai.onrender.com/](https://omok-sai.onrender.com/)입니다. 아래 단계는 같은 구성을 새 서버에 배포하는 방법입니다.

1. 프로젝트를 새 GitHub 저장소에 올립니다. `node_modules`, `.npm-cache`, `build`, `dist`, `release`, `screenshots`, `.env`는 올리지 않습니다.
2. Render 계정에 GitHub 저장소 접근을 연결합니다.
3. Render에서 **New → Blueprint**를 선택하고 이 저장소를 지정합니다. `render.yaml`을 읽어 서버를 생성합니다. 혹은 **New → Web Service**에서 아래 값을 입력합니다.

| 항목 | 값 |
| --- | --- |
| Runtime | Node |
| Region | Singapore |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance Type | Free |
| Environment | `NODE_ENV=production` |

Render가 지정하는 `PORT`를 자동으로 사용하며 `0.0.0.0`에 수신합니다. 웹 화면과 실시간 대전이 같은 공개 주소로 연결되므로 별도 CORS 설정이나 상대 PC의 포트 개방이 필요하지 않습니다.

4. 배포 상태가 Live가 되면 Render에 표시된 HTTPS URL을 엽니다.
5. 다른 브라우저에서도 접속해 닉네임 입력 → 방 만들기 → 방 코드 참가 → 준비 → 대국 시작을 확인합니다.
6. 방 안에서 **방 코드 복사**는 6자리 코드만 복사하고, **초대 링크 복사**는 실제 공개 주소를 사용하는 입장 링크를 복사합니다.

자동 재배포는 기본적으로 꺼두었습니다. 코드 업데이트 후 수동 배포하면 진행 중인 방은 초기화되므로 대국이 없는 시점에 배포합니다.

무료 서버는 15분 동안 수신 트래픽이 없으면 대기 상태가 됩니다. 다음 접속 때 약 1분의 시작 지연이 생길 수 있습니다. 서버 재시작·대기 전환·재배포 시 메모리의 방/대국/채팅은 초기화됩니다. 현재 프로젝트는 단일 서버 인스턴스를 사용하며 영구 전적이나 DB 저장 기능은 포함하지 않습니다.

공식 문서: [Node.js 배포](https://render.com/docs/deploy-node-express-app), [설정 파일](https://render.com/docs/blueprint-spec), [WebSocket 지원](https://render.com/docs/websocket), [무료 서비스 제한](https://render.com/docs/free).

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
