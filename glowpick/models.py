from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Text = Annotated[str, Field(max_length=2000)]
Ingredient = Annotated[str, Field(min_length=1, max_length=512)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class UserInput(StrictModel):
    productName: str | None = Field(default=None, max_length=200)
    packName: str | None = Field(default=None, max_length=200)
    skinType: str = Field(default="잘 모르겠음", max_length=80)
    concerns: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=12
    )
    extraConcern: Text = ""
    mixStatus: str = Field(default="unknown", max_length=80)
    notes: Text = ""


class Extraction(StrictModel):
    status: Literal["complete", "partial", "unreadable", "no_ingredients", "multiple_products"]
    productName: str | None = Field(max_length=200)
    rawText: str = Field(max_length=40000)
    ingredients: list[Ingredient] = Field(max_length=256)
    uncertainSpans: list[Text] = Field(max_length=64)
    warnings: list[Text] = Field(max_length=32)
    nextAction: Text

    @model_validator(mode="after")
    def check_consistency(self):
        if any(not item.strip() for item in self.ingredients):
            raise ValueError("빈 성분 항목은 허용하지 않습니다.")
        if self.status == "complete":
            if not self.rawText.strip() or not self.ingredients or self.uncertainSpans:
                raise ValueError("완료 응답에는 원문·성분 목록이 필요하며 불확실 구간은 없어야 합니다.")
        else:
            if not self.nextAction.strip():
                raise ValueError("미완료 응답에는 구체적인 다음 행동이 필요합니다.")
        if self.status in {"unreadable", "no_ingredients", "multiple_products"} and self.ingredients:
            raise ValueError("이 상태에서는 단일 확정 성분 목록을 반환할 수 없습니다.")
        return self


class IngredientNote(StrictModel):
    ingredient: Ingredient
    explanation: Annotated[str, Field(min_length=1, max_length=2000)]
    evidenceIds: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        min_length=1, max_length=8
    )


class ModelAnalysis(StrictModel):
    summary: Annotated[str, Field(min_length=1, max_length=2000)]
    ingredientNotes: list[IngredientNote] = Field(max_length=64)
    warnings: list[Text] = Field(max_length=32)


class ReviewedClaim(StrictModel):
    evidenceId: str
    ingredient: Ingredient
    statement: Annotated[str, Field(min_length=1, max_length=2000)]
    sourceUrl: str
    reviewStatus: Literal["reviewed_general_ingredient_function"]

    @model_validator(mode="after")
    def source_required(self):
        if not self.sourceUrl.startswith(("https://", "http://")):
            raise ValueError("출처 URL이 필요합니다.")
        return self
