# Gemini Pro를 쓰고 있다면
Gemini 웹/앱에서 대화하는 구독과 팀 프로그램에서 호출하는 API는 구분해서 확인해야 합니다. API 키는 프로그램의 호출용 인증키입니다.

1. https://aistudio.google.com/api-keys 에 Google 계정으로 로그인합니다.
2. 키 생성이 가능하면 무료 프로젝트에서 생성합니다. 과제 규정상 결제 계정은 연결하지 않습니다.
3. 키를 채팅에 붙여넣지 말고 Colab 왼쪽 열쇠 아이콘의 보안 비밀에 GEMINI_API_KEY라는 이름으로 저장합니다.
4. GEMINI_MODEL에는 본인 프로젝트에서 무료 호출 가능한 모델명을 저장합니다. 구독 중이라는 이유로 특정 모델·무료 한도를 보장하지 않습니다.
5. 이 패키지의 노트북에서 사람 확인을 마친 뒤 Gemini 선택 셀을 실행합니다.

현재 이 작업에서는 실제 계정 키가 제공/연결되지 않아 Gemini 원격 호출을 실행하지 않았습니다. SDK 2.12.1 설치와 interactions.create 인터페이스 존재는 확인했습니다. 이 확인은 모델 호출 성공을 뜻하지 않습니다.
공식 안내: https://ai.google.dev/gemini-api/docs/api-key
