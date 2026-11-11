# GlowPick 수업 시연용 Android 앱

기존 `BeautyAI/`의 공개 화면 8개 파일을 Capacitor 8.6.0으로 묶는 Android APK입니다.
Google Play 등록 없이 팀원 휴대폰에 직접 설치하는 데모입니다.
앱 이름은 GlowPick, 패키지는 `io.github.yumin0117.glowpick`, 버전은 `0.1.0-demo`입니다.

## 빌드

GitHub `main`의 `mobile/` 또는 웹 코드가 바뀌면 **Android classroom demo APK** 워크플로가 실행됩니다.
성공한 실행의 **GlowPick-Android-demo** 아티팩트에 APK·SHA256·에뮬레이터 화면·검사 보고서가 있습니다.
아티팩트는 30일 보관하므로 수업용 APK를 따로 내려받아 보관합니다.

로컬에서는 Node 22 이상, Java 21, Android SDK 36이 필요합니다.

```powershell
cd mobile
npm ci --ignore-scripts
npm run sync
cd android
.\gradlew.bat assembleDebug
```

출력: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
CI는 별도 API 키나 운영 서명 키 없이 디버그 서명으로 빌드합니다.
다른 실행의 디버그 서명이 달라 설치 업데이트가 거절되면 기존 데모를 삭제하고 설치합니다.

## 휴대폰 시연

1. `GlowPick-Android-demo.apk`를 휴대폰으로 옮겨 엽니다.
2. Android가 요청하면 해당 파일을 연 앱에 대해서만 설치를 허용합니다.
3. GlowPick을 열고 인터넷에 연결합니다.
4. 본인의 결제 미연결 무료 Gemini 프로젝트 키를 입력합니다. APK에는 키가 없습니다.
5. 전성분 사진을 선택하거나 시스템 카메라로 촬영하고 고민을 선택해 분석합니다.

화면은 앱에 포함되어 로딩되며 분석은 Google에 직접 요청합니다. 별도 서버를 만들지 않습니다.
키는 앱의 현재 WebView 화면에서만 재사용하며 새로고침·앱 화면 재생성 시 지웁니다.
앱으로 포장해도 Google의 과부하·무료 한도·콘텐츠 차단이 사라지는 것은 아닙니다.

## 검증 범위

CI에서 APK 빌드·Android lint·API 35 에뮬레이터 설치와 실행을 확인합니다.
화면의 로컬 로딩·가로 넘침·기본 빈 키·화장품/모델링팩 탭·사진 선택 브리지·키 입력 안내를
계측 검사합니다. 사진 선택은 테스트 PNG와 시스템 선택기 결과 스텁을 사용합니다.
Gemini 키를 쓰지 않는 검사이며 실제 카메라 앱·실물 휴대폰·Android 안의 Gemini 실호출은 별도 시연 확인 대상입니다.

공식 참고: [Capacitor](https://capacitorjs.com/docs/getting-started),
[Android Espresso Web](https://developer.android.com/training/testing/espresso/web).
