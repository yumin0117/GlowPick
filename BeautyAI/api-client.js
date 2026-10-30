// One Gradio Space serves both this UI and the Python API. No browser API key.
const CLIENT_URL = "https://cdn.jsdelivr.net/npm/@gradio/client@2.7.2/+esm";
let connection;

async function connect() {
  if (!connection) {
    connection = import(CLIENT_URL).then(async ({ Client, handle_file }) => ({
      app: await Client.connect(window.location.origin), handle_file
    })).catch(() => {
      connection = null;
      throw new Error("서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    });
  }
  return connection;
}

export async function health() {
  const { app } = await connect();
  return (await app.predict("/health", {})).data[0];
}

export async function analyze(endpoint, file, request) {
  const { app, handle_file } = await connect();
  let timer;
  try {
    const result = await Promise.race([
      app.predict(endpoint, { image: handle_file(file), request }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          "응답 대기 시간이 길어졌어요. 서버에서 요청이 진행 중일 수 있으니 잠시 기다린 뒤 확인해 주세요."
        )), 180000);
      })
    ]);
    const response = result.data[0];
    if (!response || typeof response.ok !== "boolean") {
      throw new Error("서버 응답 형식이 올바르지 않아요.");
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}
