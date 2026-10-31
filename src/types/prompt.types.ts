export interface CreatePromptBody {
  email: string
  title: string
  body: string
  tags: Array<string>
  icon: string
  updatedAt?: Date
  createdAt?: Date
}

export interface UpdatePromptTitle {
  email: string
  promptId: string
  title: string
}

export interface UpdatePromptBody {
  email: string
  promptId: string
  body: string
}

export interface UpdatePromptTags {
  email: string
  promptId: string
  tags: Array<string>
}

export interface UpdatePromptIcon {
  email: string
  promptId: string
  icon: string
}

export interface DeletePrompt {
  email: string
  promptId: string
}

export type AccessType = "public" | "private" | "link"

export interface IPrompt {
  _id?: string
  id?: string
  clientTempId?: string
  title: string
  body: string
  createdAt?: Date | string
  updatedAt?: Date | string
  tags: Array<string>
  icon?: string
  access?: AccessType
  likes?: number
  downloads?: number
}

export type CreatePromptRequest = Omit<
  CreatePromptBody,
  "email" | "updatedAt" | "createdAt"
>
export type UpdatePromptTitleRequest = Omit<UpdatePromptTitle, "email">
export type UpdatePromptBodyRequest = Omit<UpdatePromptBody, "email">
export type UpdatePromptTagsRequest = Omit<UpdatePromptTags, "email">
export type UpdatePromptIconRequest = Omit<UpdatePromptIcon, "email">
export type DeletePromptRequest = Omit<DeletePrompt, "email">
