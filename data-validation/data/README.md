# 데이터 상태 읽는 법
products/images/pairs/sources가 이번 재검토 기준입니다. JSON 배열·원문 보존이 필요할 때는 CSV 대신 JSON을 사용하세요.
그 외 additional_cases, ingredients, findings, evidence, example_*는 이전 ZIP에서 가져온 자료입니다. 이전 확인 날짜는 현재 웹 재검증 날짜가 아닙니다. 실제 모델 추출 응답을 의미하지 않습니다. 특히 example_output과 comparison_examples는 오류 검증용 예시입니다.
products의 physical_label_verified는 모두 false이며 pairs의 gold_status는 provisional입니다. validation_runs.csv의 데이터 행은 비어 있습니다. 실제 실행 전에는 점수를 채우지 마세요.
source_url이 있다고 현재 페이지가 확인되었다는 뜻은 아닙니다. current_web_status와 current_source_download를 함께 확인하세요.
