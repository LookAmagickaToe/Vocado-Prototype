
function extractJson(text) {
    const startArr = text.indexOf("[")
    const startObj = text.indexOf("{")

    if (startArr >= 0 && (startObj === -1 || startArr < startObj)) {
        const end = text.lastIndexOf("]")
        if (end > startArr) {
            try {
                return JSON.parse(text.slice(startArr, end + 1))
            } catch (e) {
                console.log("Array parse failed:", e.message)
            }
        }
    }

    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) {
        const slice = text.slice(start, end + 1)
        return JSON.parse(slice)
    }
    return JSON.parse(text)
}

const samples = [
    '```json\n[\n  {"id": "1"}\n]\n```',
    '[{"id": "1"}, {"id": "2"}]',
    'Some text [ {"id": "1"} ] end',
    'Just object {"id": 1}',
    'Mixed array [ {"id": 1} ] and object {"id": 2}' // Should pick array
]

samples.forEach((s, i) => {
    try {
        console.log(`Sample ${i}:`, extractJson(s))
    } catch (e) {
        console.log(`Sample ${i} failed:`, e.message)
    }
})
