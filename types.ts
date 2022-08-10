export type ActivePresentationResponse = {
    presentation: ActivePresentation | null
}

export type PresentationIndexResponse = {
    presentation_index: PresentationIndex | null
}

export type PresentationIndex = {
    index: number
    presentation_id: PresentationId
}

export type ActivePresentation = {
    id: PresentationId
    groups: Group[]
    has_timeline: boolean
    presentation_path: string
    destination: string
}

export type PresentationId = {
    uuid: string
    name: string
    index: number
}

export type Group = {
    name: string
    color: Color
    slides: Slide[]
}

export type Slide = {
    enabled: boolean
    notes: string
    text: string
    label: string
    color: Color
    size: {
        width: number
        height: number
    }
}

export type Color = {
    red: number
    green: number
    blue: number
    alpha: number
}