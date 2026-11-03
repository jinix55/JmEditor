package com.example.jmeditor;

import org.jsoup.nodes.DataNode;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 옛 글·워드·한글·엑셀 HTML 변환 (허용 검사 전 단계) — 클라이언트 core/legacy-format.js 와 같은 규칙.
 * 사례 파일 test/fixtures/legacy/cases.txt 로 양쪽을 비교한다. 정규식은 전체 일치라 선형이고, 값 길이는 STYLE_VALUE_MAX 로 묶인다.
 */
final class LegacyFormat {

    private LegacyFormat() {}

    /** 색상 값 형식: #hex, rgb(a)(), 색 이름 */
    static final Pattern SAFE_COLOR = Pattern.compile("^(#[0-9a-fA-F]{3,8}|rgba?\\([\\d \\t\\n\\f\\r.,%]+\\)|[a-zA-Z]+)$");
    /** style 선언 값 길이 상한 */
    private static final int STYLE_VALUE_MAX = 256;
    /** 단위별 px 값 (1pt=1.333px, 1mm=3.78px, 1cm=37.8px) */
    private static final Map<String, Double> PX_PER_UNIT = Map.of("px", 1.0, "pt", 1.333, "mm", 3.78, "cm", 37.8);
    /** font 태그 size 1~7 의 px */
    private static final int[] FONT_TAG_SIZES = {10, 13, 16, 18, 24, 32, 48};
    private static final int FONT_PX_MIN = 8, FONT_PX_MAX = 96, BORDER_PX_MAX = 20;
    /** font-size rem 값 (1rem=16px) */
    private static final Pattern FONT_REM = Pattern.compile("^(\\d{0,6}(?:\\.\\d{1,6})?)rem$", Pattern.CASE_INSENSITIVE);
    /** line-height 값: 단위 없는 수·%·px·pt */
    private static final Pattern LINE_HEIGHT = Pattern.compile("^(\\d{0,6}(?:\\.\\d{1,6})?)(px|pt|%)?$", Pattern.CASE_INSENSITIVE);
    /** letter-spacing 값: px·pt·em (음수 허용) */
    private static final Pattern LETTER_SPACING = Pattern.compile("^(-?)(\\d{0,6}(?:\\.\\d{1,6})?)(px|pt|em)$", Pattern.CASE_INSENSITIVE);
    /** 길이 값: px·pt·mm·cm (소수 허용, 지수 표기 불가) */
    private static final Pattern PX_PT_LENGTH = Pattern.compile("^(\\d{0,6}(?:\\.\\d{1,6})?)(px|pt|mm|cm)$", Pattern.CASE_INSENSITIVE);
    /** width·height 속성 값: 숫자(px)·px·pt·% */
    private static final Pattern LENGTH_ATTR = Pattern.compile("^\\d{1,6}(?:\\.\\d{1,6})?(?:px|pt|%)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern BORDER_WIDTH_WORD = Pattern.compile("^(thin|medium|thick)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern BORDER_STYLE_WORD = Pattern.compile("^(none|solid|dashed|dotted|double)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern BORDER_SHORTHAND = Pattern.compile("^border(-(top|right|bottom|left))?$");
    private static final Pattern BORDER_PART = Pattern.compile("^border(?:-(?:top|right|bottom|left))?-(width|style|color)$");
    private static final Pattern TEXT_ALIGN = Pattern.compile("^(left|center|right|justify)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern V_ALIGN = Pattern.compile("^(top|middle|bottom)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern BORDER_COLLAPSE = Pattern.compile("^(collapse|separate)$", Pattern.CASE_INSENSITIVE);
    /** pt·mm·cm 로 끝나는 값 */
    private static final Pattern LENGTH_NOT_PX = Pattern.compile("^.*(pt|mm|cm)$", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    /** 전부 auto */
    private static final Pattern AUTO = Pattern.compile("^auto$", Pattern.CASE_INSENSITIVE);
    /** align 을 text-align 으로 옮기는 블록 (table 은 표 위치라 따로) */
    private static final Set<String> ALIGN_BLOCK_TAGS = Set.of("p", "div", "h1", "h2", "h3", "h4", "h5", "h6");
    /** 블록을 감싼 font·span 이 안쪽 글자로 내려주는 속성 (배경은 단축값·낱개를 한 항목으로) */
    private static final Map<String, String> PENDING_KEYS = Map.of("color", "color", "font-size", "font-size", "font-family", "font-family", "background-color", "background-color", "background", "background-color", "line-height", "line-height", "letter-spacing", "letter-spacing");
    private static final Pattern FONT_TAG_SIZE = Pattern.compile("^[1-7]$");
    /** background 단축값에서 색으로 보지 않는 낱말 (색 이름 형식에 맞아도) */
    private static final Set<String> BG_KEYWORDS = Set.of("none", "repeat", "space", "round", "scroll", "fixed", "local", "left", "right", "top", "bottom", "center", "auto", "cover", "contain", "inherit", "initial", "unset", "revert");
    /** width·height pt 변환, background 변환, 옛 속성을 적용하는 표 요소 */
    private static final Set<String> TABLE_TAGS = Set.of("table", "tr", "td", "th", "col");
    /** 굵게 판정 값 */
    /** 들여쓰기 값: px·pt·mm·cm (음수는 text-indent 만, 지수 표기 불가) */
    private static final Pattern INDENT_LENGTH = Pattern.compile("^(-?)(\\d{0,6}(?:\\.\\d{1,6})?)(px|pt|mm|cm)$", Pattern.CASE_INSENSITIVE);
    /** margin-left·text-indent 를 남기는 글 블록 */
    private static final Set<String> INDENT_TAGS = Set.of("p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote");
    /** 들여쓰기 절댓값 상한(px) */
    private static final int INDENT_PX_MAX = 400;
    private static final Pattern BOLD_VALUE = Pattern.compile("^(bold|bolder|[7-9]00)$", Pattern.CASE_INSENSITIVE);
    /** 굵기 해제 값 (뒤에 오면 앞의 굵게를 덮음) */
    private static final Pattern NOT_BOLD_VALUE = Pattern.compile("^(normal|lighter|[1-6]00)$", Pattern.CASE_INSENSITIVE);
    /** 내용을 바로 감쌀 수 없어 굵기를 자식에게 넘기는 요소 */
    private static final Set<String> BOLD_PASS_TAGS = Set.of("table", "thead", "tbody", "tfoot", "tr", "colgroup", "col", "ul", "ol", "dl", "menu", "picture");
    /** strong 으로 감싸지 않고 따로 처리하는 블록 요소 */
    private static final Set<String> BOLD_BLOCK_TAGS = Set.of("address", "article", "aside", "blockquote", "caption", "center", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
            "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul");
    /** 내용을 통째로 버리는 태그 — 훑지 않는다 (클라이언트 DROP_TAGS 와 같음) */
    private static final Set<String> SKIP_TAGS = Set.of("script", "style", "iframe", "embed", "meta", "link", "title", "textarea", "select");

    /**
     * style 문자열을 선언 목록으로 나눈다. 따옴표·괄호 안의 ; : 는 구분자가 아니며, 첫 : 가 이름과 값을 나눈다.
     * @param style style 속성값
     * @return [소문자 이름, 값] 목록 (값이 비었거나 길이 상한을 넘으면 뺌)
     */
    static List<String[]> parseStyle(String style) {
        List<String[]> out = new ArrayList<>();
        char quote = 0;
        int depth = 0, start = 0, colon = -1;
        for (int i = 0; i < style.length(); i++) {
            char c = style.charAt(i);
            if (c == '\\') i++;
            else if (quote != 0) { if (c == quote) quote = 0; }
            else if (c == '"' || c == '\'') quote = c;
            else if (c == '(') depth++;
            else if (c == ')') { if (depth > 0) depth--; }
            else if (depth == 0 && c == ':' && colon < 0) colon = i;
            else if (depth == 0 && c == ';') { addDecl(out, style, start, colon, i); start = i + 1; colon = -1; }
        }
        addDecl(out, style, start, colon, style.length());
        return out;
    }

    /** 선언 하나를 잘라 목록에 넣는다 */
    private static void addDecl(List<String[]> out, String style, int start, int colon, int end) {
        if (colon < 0) return;
        String name = StructurePolicy.jsTrim(style.substring(start, colon)).toLowerCase(Locale.ROOT);
        String value = StructurePolicy.jsTrim(style.substring(colon + 1, end));
        if (!name.isEmpty() && !value.isEmpty() && value.length() <= STYLE_VALUE_MAX) out.add(new String[]{name, value});
    }

    /** 값을 공백으로 나눈다 (괄호 안 공백은 나누지 않음 — rgb(0, 0, 0)) */
    private static List<String> splitTokens(String value) {
        List<String> out = new ArrayList<>();
        int depth = 0, start = -1;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            boolean space = c == ' ' || c == '\t' || c == '\n' || c == '\f' || c == '\r';
            if (space && depth == 0) {
                if (start >= 0) { out.add(value.substring(start, i)); start = -1; }
            } else {
                if (start < 0) start = i;
                if (c == '(') depth++;
                else if (c == ')' && depth > 0) depth--;
            }
        }
        if (start >= 0) out.add(value.substring(start));
        return out;
    }

    /** px·pt·mm·cm 길이를 px 숫자로 (반올림 전). 형식이 다르면 null */
    private static Double lengthPx(String value) {
        Matcher m = PX_PT_LENGTH.matcher(value);
        if (!m.matches() || m.group(1).isEmpty()) return null;
        return Double.parseDouble(m.group(1)) * PX_PER_UNIT.get(m.group(2).toLowerCase(Locale.ROOT));
    }

    /** 숫자를 뒤의 0 없는 글자로 (클라이언트 String(number) 와 같은 모양) */
    private static String plain(double v) {
        return java.math.BigDecimal.valueOf(v).stripTrailingZeros().toPlainString();
    }

    /** 소수 둘째 자리까지 반올림 */
    private static double round2(double v) {
        return Math.round(v * 100) / 100.0;
    }

    /** font-size 를 px 글자로: px·pt·mm·cm·rem → 반올림, 8~96px 로 맞춤. em·% 등 그 밖은 null */
    private static String fontSizePx(String value) {
        Matcher rem = FONT_REM.matcher(value);
        Double px = rem.matches() && !rem.group(1).isEmpty() ? Double.valueOf(Double.parseDouble(rem.group(1)) * 16) : lengthPx(value);
        return px == null ? null : Math.min(FONT_PX_MAX, Math.max(FONT_PX_MIN, Math.round(px))) + "px";
    }

    /** line-height 정규화: 단위 없는 수 0.5~5, 50~500%, px·pt → px(8~200). 다시 조립하므로 값이 style 을 벗어날 수 없다. 그 밖은 null */
    private static String lineHeightValue(String value) {
        Matcher m = LINE_HEIGHT.matcher(value);
        if (!m.matches() || m.group(1).isEmpty()) return null;
        double n = Double.parseDouble(m.group(1));
        String unit = m.group(2) == null ? "" : m.group(2).toLowerCase(Locale.ROOT);
        if (unit.isEmpty()) return n >= 0.5 && n <= 5 ? plain(n) : null;
        if (unit.equals("%")) return n >= 50 && n <= 500 ? plain(n) + "%" : null;
        long px = Math.round(n * PX_PER_UNIT.get(unit));
        return px >= 8 && px <= 200 ? px + "px" : null;
    }

    /**
     * margin-left·text-indent 정규화: px·pt·mm·cm → 정수 px, 범위 안만 (다시 조립하므로 값이 style 을 벗어날 수 없다)
     * @param value 값
     * @param negative 음수 허용 (text-indent 의 내어쓰기)
     * @return 정규화한 값, 범위·단위 밖이면 null
     */
    private static String indentValue(String value, boolean negative) {
        if (value.equals("0")) return "0px";
        Matcher m = INDENT_LENGTH.matcher(value);
        if (!m.matches() || m.group(2).isEmpty() || (!m.group(1).isEmpty() && !negative)) return null;
        long px = Math.round(Double.parseDouble(m.group(2)) * PX_PER_UNIT.get(m.group(3).toLowerCase(Locale.ROOT)));
        if (px > INDENT_PX_MAX) return null;
        return (m.group(1).isEmpty() ? px : -px) + "px";
    }

    /** letter-spacing 정규화: px·pt → px(소수 둘째 자리, -10~20), em(-1~2). 0 은 기본값이라 지움. 그 밖은 null */
    private static String letterSpacingValue(String value) {
        Matcher m = LETTER_SPACING.matcher(value);
        if (!m.matches() || m.group(2).isEmpty()) return null;
        double n = Double.parseDouble(m.group(2)) * (m.group(1).isEmpty() ? 1 : -1);
        String unit = m.group(3).toLowerCase(Locale.ROOT);
        if (unit.equals("em")) return n != 0 && n >= -1 && n <= 2 ? plain(n) + "em" : null;
        double px = round2(n * PX_PER_UNIT.get(unit));
        return px != 0 && px >= -10 && px <= 20 ? plain(px) + "px" : null;
    }

    /** 테두리 폭 정규화: 키워드, 0, px·pt·mm·cm (0~20px, 소수 둘째 자리까지 실제 값, 0 초과인데 0.01 미만이면 0.01px). 어긋나면 null */
    private static String borderWidth(String value) {
        if (BORDER_WIDTH_WORD.matcher(value).matches()) return value.toLowerCase(Locale.ROOT);
        if (value.equals("0")) return "0px";
        Double px = lengthPx(value);
        if (px == null || px > BORDER_PX_MAX) return null;
        if (px == 0) return "0px";
        return (px < 0.01 ? "0.01" : plain(round2(px))) + "px";
    }

    /** 테두리 단축값 정규화: 토큰 3개 이하, 폭·스타일·색 각 하나까지. 어긋나면 null */
    private static String borderShorthand(String value) {
        List<String> tokens = splitTokens(value);
        if (tokens.isEmpty() || tokens.size() > 3) return null;
        String width = null, style = null, color = null;
        for (String t : tokens) {
            String w = borderWidth(t);
            if (w != null) { if (width != null) return null; width = w; }
            else if (BORDER_STYLE_WORD.matcher(t).matches()) { if (style != null) return null; style = t.toLowerCase(Locale.ROOT); }
            else if (SAFE_COLOR.matcher(t).matches()) { if (color != null) return null; color = t; }
            else return null;
        }
        List<String> parts = new ArrayList<>();
        if (width != null) parts.add(width);
        if (style != null) parts.add(style);
        if (color != null) parts.add(color);
        return String.join(" ", parts);
    }

    /** background 단축값에서 첫 색을 찾는다. 없으면 null */
    private static String backgroundColor(String value) {
        for (String t : splitTokens(value)) {
            if (SAFE_COLOR.matcher(t).matches() && !BG_KEYWORDS.contains(t.toLowerCase(Locale.ROOT))) return t;
        }
        return null;
    }

    /** 변환 결과: 이 규칙 대상이 아님 (일반 허용 검사로) */
    static final String[] NOT_LEGACY = new String[0];

    /**
     * style 선언 하나를 옛 형식 규칙으로 변환한다
     * @param name 소문자 속성 이름
     * @param value 값
     * @param tag 그 style 을 가진 요소의 태그
     * @param fonts 글꼴 정책
     * @return [이름, 값], 지우면 null, 대상이 아니면 {@link #NOT_LEGACY}
     */
    static String[] cleanDecl(String name, String value, String tag, FontPolicy fonts) {
        boolean cell = tag.equals("td") || tag.equals("th");
        if (name.equals("font-family")) {
            String family = fonts.storedName(value);
            return family == null ? null : new String[]{name, FontPolicy.cssValue(family)};
        }
        if (name.equals("font-size")) {
            String size = fontSizePx(value);
            return size == null ? null : new String[]{name, size};
        }
        if (name.equals("line-height")) {
            String v = lineHeightValue(value);
            return v == null ? null : new String[]{name, v};
        }
        if (name.equals("letter-spacing")) {
            String v = letterSpacingValue(value);
            return v == null ? null : new String[]{name, v};
        }
        if ((name.equals("width") || name.equals("height")) && TABLE_TAGS.contains(tag) && LENGTH_NOT_PX.matcher(value).matches()) {
            Double px = lengthPx(value);
            return px == null ? null : new String[]{name, Math.round(px) + "px"};
        }
        if (name.equals("background")) {
            String color = TABLE_TAGS.contains(tag) || tag.equals("span") ? backgroundColor(value) : null;
            return color == null ? null : new String[]{"background-color", color};
        }
        if (name.equals("margin-left") || name.equals("margin-right")) { // 표 가운데 정렬(align=center)의 값, 글 블록의 왼쪽 들여쓰기
            if (name.equals("margin-left") && INDENT_TAGS.contains(tag)) {
                String v = indentValue(value, false);
                return v == null ? null : new String[]{name, v};
            }
            return tag.equals("table") && AUTO.matcher(value).matches() ? new String[]{name, "auto"} : null;
        }
        if (name.equals("text-indent")) { // 첫 줄 들여쓰기 (음수는 내어쓰기) — HWP·워드
            String v = INDENT_TAGS.contains(tag) ? indentValue(value, true) : null;
            return v == null ? null : new String[]{name, v};
        }
        if (name.equals("border-collapse")) {
            return tag.equals("table") && BORDER_COLLAPSE.matcher(value).matches() ? new String[]{name, value.toLowerCase(Locale.ROOT)} : null;
        }
        if (BORDER_SHORTHAND.matcher(name).matches()) {
            String v = cell ? borderShorthand(value) : null;
            return v == null ? null : new String[]{name, v};
        }
        Matcher part = BORDER_PART.matcher(name);
        if (part.matches()) {
            if (!cell) return null;
            String v = switch (part.group(1)) {
                case "width" -> borderWidth(value);
                case "style" -> BORDER_STYLE_WORD.matcher(value).matches() ? value.toLowerCase(Locale.ROOT) : null;
                default -> SAFE_COLOR.matcher(value).matches() ? value : null;
            };
            return v == null ? null : new String[]{name, v};
        }
        return NOT_LEGACY;
    }

    /**
     * 옛 속성을 style 선언으로 옮긴다. style 에 이미 있는 속성은 style 이 우선. 값은 검사를 통과한 것만 쓴다(세미콜론 주입 방지).
     * 속성 자체는 뒤의 허용 목록이 지운다.
     */
    private static void moveAttrs(Element el, String tag, FontPolicy fonts) {
        List<String[]> pairs = new ArrayList<>();
        if (tag.equals("font")) {
            String color = attr(el, "color"), size = attr(el, "size");
            if (SAFE_COLOR.matcher(color).matches()) pairs.add(new String[]{"color", color});
            if (FONT_TAG_SIZE.matcher(size).matches()) pairs.add(new String[]{"font-size", FONT_TAG_SIZES[Integer.parseInt(size) - 1] + "px"});
            String family = fonts.storedName(attr(el, "face"));
            if (family != null) pairs.add(new String[]{"font-family", FontPolicy.cssValue(family)});
        } else if (TABLE_TAGS.contains(tag)) {
            String bg = attr(el, "bgcolor"), align = attr(el, "align"), valign = attr(el, "valign");
            if (SAFE_COLOR.matcher(bg).matches()) pairs.add(new String[]{"background-color", bg});
            if (tag.equals("table")) {
                if (align.equalsIgnoreCase("center")) { // 표 위치 — text-align 으로 옮기면 칸 글자가 가운데로 간다. left·right 는 지움
                    pairs.add(new String[]{"margin-left", "auto"});
                    pairs.add(new String[]{"margin-right", "auto"});
                }
                if (attr(el, "border").equals("0") && !el.hasAttr("data-border")) el.attr("data-border", "0");
            } else if (TEXT_ALIGN.matcher(align).matches()) pairs.add(new String[]{"text-align", align.toLowerCase(Locale.ROOT)});
            if (V_ALIGN.matcher(valign).matches()) pairs.add(new String[]{"vertical-align", valign.toLowerCase(Locale.ROOT)});
            for (String n : List.of("width", "height")) {
                String v = attr(el, n);
                if (LENGTH_ATTR.matcher(v).matches()) pairs.add(new String[]{n, Character.isDigit(v.charAt(v.length() - 1)) ? v + "px" : v});
            }
        } else if (ALIGN_BLOCK_TAGS.contains(tag) && TEXT_ALIGN.matcher(attr(el, "align")).matches()) {
            pairs.add(new String[]{"text-align", attr(el, "align").toLowerCase(Locale.ROOT)});
        }
        if (pairs.isEmpty()) return;
        String style = el.attr("style");
        Set<String> has = new HashSet<>();
        for (String[] d : parseStyle(style)) has.add(d[0].equals("background") ? "background-color" : d[0]);
        List<String> add = new ArrayList<>();
        for (String[] p : pairs) if (!has.contains(p[0])) add.add(p[0] + ": " + p[1]);
        if (!add.isEmpty()) el.attr("style", String.join("; ", add) + (style.isEmpty() ? "" : "; " + style));
    }

    /** 속성값 (앞뒤 공백 제거) */
    private static String attr(Element el, String name) {
        return StructurePolicy.jsTrim(el.attr(name));
    }

    /** style 의 마지막 유효 font-weight 판정: 굵게 true, 해제 false, 지정 없음 null */
    private static Boolean boldState(String style) {
        Boolean bold = null;
        if (style.isEmpty()) return null;
        for (String[] d : parseStyle(style)) {
            if (!d[0].equals("font-weight")) continue;
            if (BOLD_VALUE.matcher(d[1]).matches()) bold = true;
            else if (NOT_BOLD_VALUE.matcher(d[1]).matches()) bold = false;
        }
        return bold;
    }

    /** 내려줄 스타일에 요소의 style 을 더한다 (같은 항목은 안쪽이 이김). 비면 null */
    private static Map<String, String> addPending(Map<String, String> pending, String style) {
        Map<String, String> out = pending == null ? new LinkedHashMap<>() : new LinkedHashMap<>(pending);
        for (String[] d : parseStyle(style)) if (PENDING_KEYS.containsKey(d[0])) out.put(PENDING_KEYS.get(d[0]), d[0] + ": " + d[1]);
        return out.isEmpty() ? null : out;
    }

    /** 블록이 직접 지정한 항목은 내려받지 않는다 (블록의 값이 이긴다). 비면 null */
    private static Map<String, String> dropDeclared(Map<String, String> pending, String style) {
        if (pending == null || style.isEmpty()) return pending;
        Map<String, String> out = new LinkedHashMap<>(pending);
        for (String[] d : parseStyle(style)) if (PENDING_KEYS.containsKey(d[0])) out.remove(PENDING_KEYS.get(d[0]));
        return out.isEmpty() ? null : out;
    }

    /** 블록을 품은 요소 집합: 블록에서 위로 올라가며 표시한다 (이미 표시한 곳에서 멈춰 선형) */
    private static Set<Element> elementsWithBlock(Element root) {
        Set<Element> marked = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        for (Element b : root.getAllElements()) {
            if (b == root || !BOLD_BLOCK_TAGS.contains(b.normalName())) continue;
            for (Element a = b.parent(); a != null && a != root && marked.add(a); a = a.parent()) { /* 표시만 */ }
        }
        return marked;
    }

    /** 작업 스택 항목: 요소, 굵게 해야 함, 이미 굵은 안쪽임, 내려줄 스타일 */
    private record Work(Element el, boolean want, boolean done, Map<String, String> pending) {}

    /**
     * 파싱한 문서를 한 번 훑어 옛 형식을 바꾼다: font·표 옛 속성 → style, 굵은 요소의 내용 → strong,
     * 블록을 감싼 font·span → 속성을 지우고(뒤에서 벗겨짐) 안쪽 글자에 span 으로 내려줌.
     * 재귀 없이 스택으로 돌고, 감싸기는 묶음마다 한 번이라 선형이다. font 태그 이름은 호출하는 쪽 별칭이 span 으로 바꾼다.
     * @param root body
     * @param fonts 글꼴 정책
     * @param keepCaption caption 이 허용 태그인지 (아니면 표 앞 문단으로 — 벗기면 표 안에 글이 남아 다시 파싱할 때 달라진다)
     */
    static void normalize(Element root, FontPolicy fonts, boolean keepCaption) {
        moveDecorations(root);
        Set<Element> withBlock = elementsWithBlock(root);
        Deque<Work> stack = new ArrayDeque<>();
        for (Element c : root.children()) stack.push(new Work(c, false, false, null));
        while (!stack.isEmpty()) {
            Work w = stack.pop();
            Element el = w.el();
            String tag = el.normalName();
            if (SKIP_TAGS.contains(tag)) continue;
            if (tag.equals("caption") && !keepCaption && el.parent() != null && el.parent().normalName().equals("table")) {
                Element p = new Element("p");
                if (el.hasAttr("style")) p.attr("style", el.attr("style"));
                List<Node> kids = new ArrayList<>(el.childNodes());
                el.empty();
                p.appendChildren(kids);
                el.parent().before(p);
                el.remove();
                stack.push(new Work(p, w.want(), w.done(), w.pending()));
                continue;
            }
            moveAttrs(el, tag, fonts);
            boolean button = isButton(el);
            boolean plugin = tag.equals("div") && el.hasAttr("data-type");
            boolean host = (tag.equals("font") || tag.equals("span")) && withBlock.contains(el);
            String style = el.attr("style");
            boolean want = !plugin && !button && (w.want() || Boolean.TRUE.equals(boldState(style)));
            boolean done = w.done() || tag.equals("strong") || tag.equals("b") || tag.equals("th");
            Map<String, String> pending = plugin || button ? null : w.pending();
            if (host) {
                pending = addPending(pending, style);
                el.clearAttributes();
            } else pending = dropDeclared(pending, style);
            if (BOLD_PASS_TAGS.contains(tag)) {
                for (Element c : el.children()) stack.push(new Work(c, want, done, pending));
            } else if ((want && !done) || pending != null || host) {
                wrapRuns(el, want && !done, done, pending, host, withBlock, stack);
            } else {
                for (Element c : el.children()) stack.push(new Work(c, false, done || button, null));
            }
        }
    }

    /** font-style·text-decoration 을 태그로 옮길 때의 상태: 기울임·밑줄·취소선 */
    private record Deco(boolean em, boolean u, boolean s) {
        static final Deco NONE = new Deco(false, false, false);
    }

    /** 작업 하나: 요소, 감쌀 서식, 이미 안에 있는 서식 */
    private record DecoWork(Element el, Deco want, Deco done) {}

    /**
     * font-style·text-decoration 을 em·u·s 로 옮긴다 (클라이언트 moveDecorations 와 같은 규칙: 블록과 표·목록 구조는 안쪽으로 넘기고 글 묶음을 감싼다).
     * 이미 그 태그 안이면 감싸지 않고, a 자신의 밑줄은 옮기지 않으며, 버튼 링크·플러그인 블록 자신의 style 은 보지 않는다
     * @param root body
     */
    private static void moveDecorations(Element root) {
        boolean any = false;
        for (Element e : root.select("[style]")) {
            String st = e.attr("style").toLowerCase(java.util.Locale.ROOT);
            if (st.contains("font-style") || st.contains("text-decoration")) { any = true; break; }
        }
        if (!any) return;
        Set<Element> withBlock = elementsWithBlock(root);
        Deque<DecoWork> stack = new ArrayDeque<>();
        for (Element c : root.children()) stack.push(new DecoWork(c, Deco.NONE, Deco.NONE));
        while (!stack.isEmpty()) {
            DecoWork w = stack.pop();
            Element el = w.el();
            String tag = el.normalName();
            if (SKIP_TAGS.contains(tag) || isButton(el)) continue;
            if (tag.equals("div") && el.hasAttr("data-type")) {
                for (Element c : el.children()) stack.push(new DecoWork(c, Deco.NONE, w.done()));
                continue;
            }
            Boolean ownEm = italicState(el.attr("style"));
            boolean[] line = lineState(el.attr("style"));
            Deco next = new Deco(ownEm != null ? ownEm : w.want().em(), w.want().u() || (line[0] && !tag.equals("a")), w.want().s() || line[1]);
            Deco done = new Deco(w.done().em() || tag.equals("em") || tag.equals("i"), w.done().u() || tag.equals("u"), w.done().s() || tag.equals("s") || tag.equals("strike"));
            if (BOLD_PASS_TAGS.contains(tag)) {
                for (Element c : el.children()) stack.push(new DecoWork(c, next, done));
                continue;
            }
            Deco wrap = new Deco(next.em() && !done.em(), next.u() && !done.u(), next.s() && !done.s());
            if (!wrap.em() && !wrap.u() && !wrap.s()) {
                for (Element c : el.children()) stack.push(new DecoWork(c, Deco.NONE, done));
                continue;
            }
            Deco inside = new Deco(done.em() || wrap.em(), done.u() || wrap.u(), done.s() || wrap.s());
            List<Node> run = new ArrayList<>();
            for (Node n : new ArrayList<>(el.childNodes())) {
                if (n instanceof TextNode) { run.add(n); continue; }
                if (!(n instanceof Element e)) continue;
                String childTag = e.normalName();
                if (BOLD_BLOCK_TAGS.contains(childTag) || withBlock.contains(e)) {
                    flushDeco(run, wrap, inside, stack);
                    stack.push(new DecoWork(e, next, done));
                } else if (isButton(e)) {
                    flushDeco(run, wrap, inside, stack);
                } else if (wrap.em() && Boolean.FALSE.equals(italicState(e.attr("style")))) {
                    flushDeco(run, wrap, inside, stack);
                    stack.push(new DecoWork(e, new Deco(false, next.u(), next.s()), done));
                } else run.add(n);
            }
            flushDeco(run, wrap, inside, stack);
        }
    }

    /** 글 묶음을 em·u·s 로 감싸고 안쪽 요소를 작업에 넣는다. 글이 없으면 감싸지 않는다 */
    private static void flushDeco(List<Node> run, Deco wrap, Deco inside, Deque<DecoWork> stack) {
        if (run.stream().anyMatch(LegacyFormat::hasText)) {
            Element outer = null, inner = null;
            for (String[] t : new String[][] {{"em", String.valueOf(wrap.em())}, {"u", String.valueOf(wrap.u())}, {"s", String.valueOf(wrap.s())}}) {
                if (!t[1].equals("true")) continue;
                Element e = new Element(t[0]);
                if (inner != null) inner.appendChild(e); else outer = e;
                inner = e;
            }
            run.get(0).before(outer);
            for (Node n : run) inner.appendChild(n);
        }
        for (Node n : run) if (n instanceof Element e) stack.push(new DecoWork(e, Deco.NONE, inside));
        run.clear();
    }

    /** style 의 기울임: true, 해제: false, 지정 없음: null (마지막 값) */
    private static Boolean italicState(String style) {
        Boolean em = null;
        for (String[] d : parseStyle(style)) {
            if (!d[0].equals("font-style")) continue;
            String v = d[1].toLowerCase(java.util.Locale.ROOT);
            if (v.matches("(italic|oblique)\\b.*")) em = true;
            else if (v.equals("normal")) em = false;
        }
        return em;
    }

    /** style 의 밑줄·취소선 (마지막 값) */
    private static boolean[] lineState(String style) {
        boolean[] out = {false, false};
        for (String[] d : parseStyle(style)) {
            if (!d[0].equals("text-decoration") && !d[0].equals("text-decoration-line")) continue;
            String v = d[1].toLowerCase(java.util.Locale.ROOT);
            out[0] = v.matches(".*\\bunderline\\b.*");
            out[1] = v.matches(".*\\bline-through\\b.*");
        }
        return out;
    }

    /** 버튼 링크인지 */
    private static boolean isButton(Element el) {
        return el.normalName().equals("a") && "button".equals(el.attr("data-role"));
    }

    /**
     * 요소의 인라인 자식 묶음을 strong·span 으로 감싼다. 블록 자식에는 넘기고, 글자 없는 묶음은 감싸지 않는다.
     * 버튼 링크·플러그인 블록은 건드리지 않고, 굵기를 해제한 자식과 이미 strong 인 자식은 strong 밖에 둔다.
     * 자식을 한 번에 비우고 순서대로 다시 붙인다 (하나씩 옮기면 형제 수에 이차 시간).
     * @param host 벗겨질 요소라 빈 글자도 버린다
     */
    private static void wrapRuns(Element el, boolean bold, boolean done, Map<String, String> pending, boolean host, Set<Element> withBlock, Deque<Work> stack) {
        List<Node> kids = new ArrayList<>(el.childNodes());
        el.empty();
        List<Node> run = new ArrayList<>();
        for (Node n : kids) {
            if (!(n instanceof Element) && !(n instanceof TextNode)) {
                flushRun(el, run, bold, done, pending, host, stack); // 주석 등: 뒤의 허용 검사가 지운다
                el.appendChild(n);
                continue;
            }
            Element e = n instanceof Element x ? x : null;
            String tag = e == null ? "" : e.normalName();
            if (e != null && (BOLD_BLOCK_TAGS.contains(tag) || withBlock.contains(e))) {
                flushRun(el, run, bold, done, pending, host, stack);
                el.appendChild(n);
                stack.push(new Work(e, bold, done, pending));
            } else if (e != null && isButton(e)) {
                flushRun(el, run, bold, done, pending, host, stack);
                el.appendChild(n);
                stack.push(new Work(e, false, done, null));
            } else if (e != null && bold && (tag.equals("strong") || tag.equals("b") || Boolean.FALSE.equals(boldState(e.attr("style"))))) {
                flushRun(el, run, bold, done, pending, host, stack);
                el.appendChild(n);
                stack.push(new Work(e, false, true, pending));
            } else run.add(n);
        }
        flushRun(el, run, bold, done, pending, host, stack);
    }

    /** 모은 인라인 묶음을 붙인다 (글자가 있으면 span·strong 안에) */
    private static void flushRun(Element el, List<Node> run, boolean bold, boolean done, Map<String, String> pending, boolean host, Deque<Work> stack) {
        if (run.isEmpty()) return;
        boolean text = false;
        for (Node n : run) if (hasText(n)) { text = true; break; }
        Element target = el;
        if (text) {
            if (pending != null) {
                Element span = new Element("span");
                span.attr("style", String.join("; ", pending.values()));
                target.appendChild(span);
                target = span;
            }
            if (bold) {
                Element strong = new Element("strong");
                target.appendChild(strong);
                target = strong;
            }
        }
        for (Node n : run) {
            if (!text && host && n instanceof TextNode) continue;
            target.appendChild(n);
            if (n instanceof Element e) stack.push(new Work(e, false, done || bold, null));
        }
        run.clear();
    }

    /** 노드 안에 공백이 아닌 글자가 있는지 (script 내용 포함 — 브라우저 textContent 와 같게) */
    private static boolean hasText(Node node) {
        Deque<Node> nodes = new ArrayDeque<>();
        nodes.push(node);
        while (!nodes.isEmpty()) {
            Node n = nodes.pop();
            if (n instanceof TextNode t) { if (!StructurePolicy.isJsBlank(t.getWholeText())) return true; }
            else if (n instanceof DataNode d) { if (!StructurePolicy.isJsBlank(d.getWholeData())) return true; }
            else for (Node c : n.childNodes()) nodes.push(c);
        }
        return false;
    }
}
