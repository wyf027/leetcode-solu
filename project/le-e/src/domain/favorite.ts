export interface FavoriteQuestionRef {
  readonly title: string
  readonly slug: string
}

export interface FavoriteFolder {
  readonly slug: string
  readonly name: string
  readonly writable: boolean
  readonly questions: readonly FavoriteQuestionRef[]
}
