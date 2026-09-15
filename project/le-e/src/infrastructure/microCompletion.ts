// Micro owns buffer edits; the host renders the completion menu without modifying text.
export const MICRO_COMPLETION_PLUGIN = `
local hintutil = import("micro/util")
local hintWords = {
    js = [[const let var function return if else for while break continue switch case default try catch finally throw new class extends static async await true false null undefined typeof instanceof import export Array Map Set Math JSON Object Number String Promise console length push pop shift unshift slice splice sort reverse join split map filter reduce forEach includes indexOf find charAt charCodeAt from max min floor ceil abs log stringify parse]],
    py = [[def return if elif else for while break continue class import from as try except finally raise with lambda yield True False None and or not in is pass len range enumerate zip sorted reversed list dict set tuple str int float bool sum max min abs print append pop extend insert remove index count sort reverse keys values items get setdefault deque heapq heappush heappop]],
    java = [[class public private protected static final return new boolean int long double char void if else for while break continue switch case try catch throw null true false String System Integer Math Arrays Collections ArrayList HashMap HashSet List Map Set add get put remove containsKey contains size length sort max min println]],
    cpp = [[int long bool double char auto const void vector string unordered_map unordered_set map set queue priority_queue stack deque pair if else for while return break continue switch case true false nullptr sizeof sort reverse lower_bound upper_bound max min swap push_back emplace_back pop_back size begin end empty top front back]],
}
local function languageCandidates(buf)
    local bytes = buf:GetWord()
    local prefix = hintutil.String(bytes)
    if not prefix:match("^[A-Za-z_][A-Za-z0-9_]*$") then return {}, {}, prefix end
    local cursor = buf:GetActiveCursor()
    local nextRune = hintutil.RuneStr(cursor:RuneUnder(cursor.X))
    if hintutil.IsWordChar(nextRune) then return {}, {}, prefix end
    local extension = buf.Path:match("%.([%w]+)$")
    local suggestions = {}
    for word in (hintWords[extension] or ""):gmatch("%S+") do
        if #word > #prefix and word:sub(1, #prefix) == prefix then
            table.insert(suggestions, word)
        end
    end
    table.sort(suggestions)
    local completions = {}
    for _, word in ipairs(suggestions) do
        table.insert(completions, word:sub(#prefix + 1))
    end
    return completions, suggestions, prefix
end

local function emitCompletion(prefix, suggestions)
    io.write(string.char(27) .. "]777;lee-completion;" .. prefix .. ";" .. table.concat(suggestions, ",") .. string.char(7))
    io.flush()
end

function hideCompletion(bp)
    emitCompletion("", {})
    return true
end

local function showCandidates(bp, minimum)
    if bp.Cursor:HasSelection() or bp.Buf.AbsPath ~= os.getenv("LE_E_SOURCE_PATH") then return hideCompletion(bp) end
    local _, suggestions, prefix = languageCandidates(bp.Buf)
    if #prefix < minimum or #prefix > 64 then return hideCompletion(bp) end
    emitCompletion(prefix, suggestions)
    return true
end

function onRune(bp, rune)
    return showCandidates(bp, 2)
end

function showCompletion(bp)
    return showCandidates(bp, 1)
end

function acceptCompletion(bp)
    local request = io.open(config.ConfigDir .. "/completion-request", "r")
    if request == nil then return false end
    local expected = request:read("*l")
    local word = request:read("*l")
    request:close()
    if bp.Buf.AbsPath ~= os.getenv("LE_E_SOURCE_PATH") or bp.Cursor:HasSelection() then return hideCompletion(bp) end
    local completions, suggestions, prefix = languageCandidates(bp.Buf)
    if expected == prefix then
        for index, candidate in ipairs(suggestions) do
            if candidate == word then
                bp.Buf:Autocomplete(function(buf) return { completions[index] }, { candidate } end)
                break
            end
        end
    end
    return hideCompletion(bp)
end

function configureCompletion()
    config.TryBindKey("Tab", "IndentSelection|InsertTab", true)
    config.TryBindKey("CtrlSpace", "lua:initlua.showCompletion", true)
    config.TryBindKey("F9", "lua:initlua.acceptCompletion", true)
    for _, action in ipairs({"CursorLeft", "CursorRight", "CursorUp", "CursorDown", "StartOfText", "StartOfLine", "EndOfLine", "Start", "End", "MousePress", "MouseRelease", "Undo", "Redo", "Find", "Paste", "SelectLeft", "SelectRight", "SelectUp", "SelectDown"}) do
        _M["on" .. action] = hideCompletion
    end
end
function onBackspace(bp)
    onRune(bp, nil)
    return true
end
function onDelete(bp)
    onRune(bp, nil)
    return true
end
`
