package com.example.jmeditor;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 서버 측 HTML sanitize — 클라이언트(core/Sanitizer.js)와 동일 범위.
 * 클라이언트 sanitize 는 UX 용이므로 저장 전 반드시 이 클래스를 거친다.
 */
@Component
public class HtmlSanitizer {

    /** 색상 값 형식: #hex, rgb(a)(), 색 이름 */
    private static final Pattern SAFE_COLOR = Pattern.compile("^(#[0-9a-fA-F]{3,8}|rgba?\\([\\d\\s.,%]+\\)|[a-zA-Z]+)$");
    /** style 속성에서 허용하는 CSS 속성과 값 형식 (클라이언트 Sanitizer 와 동일) */
    private static final java.util.Map<String, Pattern> ALLOWED_STYLE = java.util.Map.of(
            "color", SAFE_COLOR,
            "background-color", SAFE_COLOR,
            "text-align", Pattern.compile("^(left|center|right|justify)$", Pattern.CASE_INSENSITIVE),
            "vertical-align", Pattern.compile("^(top|middle|bottom)$", Pattern.CASE_INSENSITIVE),
            "width", Pattern.compile("^(\\d+(\\.\\d+)?(px|%)|auto)$", Pattern.CASE_INSENSITIVE),
            "height", Pattern.compile("^\\d+(\\.\\d+)?px$", Pattern.CASE_INSENSITIVE),
            "font-size", Pattern.compile("^([89]|[1-8]\\d|9[0-6])px$"),
            "list-style-type", Pattern.compile("^(disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-roman|upper-roman|hangul|hangul-consonant|none)$", Pattern.CASE_INSENSITIVE));

    private final Safelist safelist = new Safelist()
            .addTags("p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "blockquote",
                     "a", "img", "table", "tbody", "thead", "colgroup", "col", "tr", "td", "th", "span", "div", "iframe")
            .addAttributes("a", "href", "target", "rel", "data-role", "data-style", "data-size",
                           "data-color", "data-tone", "data-icon", "data-icon-pos", "style")   // 버튼: 색·아이콘 (값 검사는 cleanButton)
            .addAttributes("img", "src", "alt", "width", "height", "data-float", "style")   // 글 감싸기: 방향 + 폭(%)
            .addAttributes("p", "style")
            .addAttributes("h1", "style").addAttributes("h2", "style").addAttributes("h3", "style")
            .addAttributes("li", "style").addAttributes("blockquote", "style", "data-style")   // 인용 스타일: box·quote (세로선은 기본값)
            .addAttributes("ul", "style")
            .addAttributes("ol", "style", "start")
            .addAttributes("table", "style", "data-border")
            .addAttributes("col", "style")
            .addAttributes("tr", "style")
            .addAttributes("td", "style", "colspan", "rowspan")
            .addAttributes("th", "style", "colspan", "rowspan")
            .addAttributes("span", "style")
            .addAttributes("div", "data-type", "data-cols", "data-auto", "data-layout", "data-align", "data-width", "data-interval", "data-ratio", "data-indicator", "data-indicator-pos",
                           "data-preset", "data-variant", "data-split", "data-cell",    // 이미지+글 배치 블록
                           "data-provider", "data-timestamp", "data-key", "data-height", "data-title") // 카카오 지도 블록
            .addAttributes("iframe", "src", "title", "allow", "allowfullscreen")
            .addProtocols("iframe", "src", "https")   // 유튜브 블록
            .addAttributes("p", "data-role")                                 // 갤러리·슬라이드 제목
            .addProtocols("a", "href", "http", "https", "mailto")
            .addProtocols("img", "src", "http", "https", "data")
            .addEnforcedAttribute("a", "rel", "noopener noreferrer")
            .addEnforcedAttribute("a", "target", "_blank")
            .preserveRelativeLinks(true);

    /**
     * 프로토콜 검사용 가상 기준 주소.
     * jsoup 은 baseUri 로 절대 주소를 만든 뒤 프로토콜을 검사하므로, 빈 값이면 /uploads/... 같은 상대 경로가 전부 제거된다.
     * preserveRelativeLinks(true) 라 저장되는 값은 원래의 상대 경로 그대로다.
     */
    private static final String PROTOCOL_CHECK_BASE_URI = "http://jm-editor.local/";

    /** 제목 p[data-role=title] 을 가질 수 있는 블록 */
    private static final java.util.Set<String> TITLED_BLOCKS = java.util.Set.of("gallery", "slider");

    /** 버튼 전용 속성 (일반 링크에서는 제거) */
    private static final java.util.List<String> BUTTON_ATTRS = java.util.List.of("data-role", "data-style", "data-size", "data-color", "data-tone", "data-icon", "data-icon-pos", "style");
    /** 버튼 모양·테마 색·아이콘 허용 값 — 클라이언트 src/plugins/buttons/button-theme.js 와 같아야 한다 */
    private static final java.util.Set<String> BUTTON_SHAPES = java.util.Set.of("primary", "outline", "soft", "gray");
    private static final java.util.Set<String> BUTTON_COLORS = java.util.Set.of("green", "red", "orange", "purple", "gray", "black"); // blue 는 기본값이라 저장하지 않음
    private static final java.util.Set<String> BUTTON_ICONS = java.util.Set.of("arrow", "external", "download", "phone", "mail", "calendar", "pin", "search",
            "play", "check", "info", "heart", "star", "plus", "chat", "file");
    /** 버튼 직접 색: style 의 --jm-btn: #rgb | #rrggbb */
    private static final Pattern BUTTON_COLOR = Pattern.compile("(?:^|;)\\s*--jm-btn\\s*:\\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\\s*(?:;|$)");

    /** img src 에 허용하는 data: 주소: 이미지 base64 만 (img 안의 svg 는 스크립트가 실행되지 않아 허용, data:text/html 등은 제거) */
    private static final Pattern DATA_IMAGE = Pattern.compile("^data:image/(png|jpeg|jpg|gif|webp|svg\\+xml);base64,", Pattern.CASE_INSENSITIVE);

    /** 카카오 지도 블록 값 형식 */
    private static final Pattern MAP_TIMESTAMP = Pattern.compile("^\\d{10,16}$");
    private static final Pattern MAP_KEY = Pattern.compile("^[A-Za-z0-9]{2,32}$");

    /** 글 감싸기 이미지 폭: 10~100 % 정수 */
    private static final Pattern IMG_WIDTH = Pattern.compile("^width:\\s*(\\d{1,3})%$");

    /**
     * 이미지+글 배치 블록: preset → variant → 칸 저장 순서 (i = 이미지 칸, t = 글 칸).
     * 클라이언트 src/plugins/layout/layout-presets.js 와 같아야 한다.
     */
    private static final java.util.Map<String, java.util.Map<String, String>> LAYOUT_CELLS = java.util.Map.of(
            "side", java.util.Map.of("left", "it", "right", "ti"),
            "one", java.util.Map.of("tl", "itt", "tr", "tit", "bl", "tit", "br", "tti"),
            "diagonal", java.util.Map.of("tl-br", "itti", "tr-bl", "tiit"),
            "pair", java.util.Map.of("top", "itit", "bottom", "titi"));
    /** preset 별 기본 variant */
    private static final java.util.Map<String, String> LAYOUT_DEFAULT_VARIANT = java.util.Map.of(
            "side", "left", "one", "tl", "diagonal", "tl-br", "pair", "top");
    /** 배치 블록에 남기는 속성 */
    private static final java.util.Set<String> LAYOUT_ATTRS = java.util.Set.of("data-type", "data-preset", "data-variant", "data-split");

    /**
     * @param html 클라이언트에서 받은 HTML
     * @return 허용 태그/속성만 남긴 HTML
     */
    public String clean(String html) {
        if (html == null || html.isBlank()) return "";
        String cleaned = Jsoup.clean(html, PROTOCOL_CHECK_BASE_URI, safelist, new Document.OutputSettings().prettyPrint(false));
        Document doc = Jsoup.parseBodyFragment(cleaned);

        // style 은 허용 속성·값 형식만 남김 (버튼 링크의 직접 색 --jm-btn 은 아래 cleanButton 에서 따로 처리)
        for (Element el : doc.select("[style]")) {
            if (el.tagName().equals("a")) continue;
            String style = Arrays.stream(el.attr("style").split(";"))
                    .map(d -> d.split(":", 2))
                    .filter(kv -> kv.length == 2)
                    .map(kv -> new String[]{kv[0].trim().toLowerCase(), kv[1].trim()})
                    .filter(kv -> ALLOWED_STYLE.containsKey(kv[0]) && ALLOWED_STYLE.get(kv[0]).matcher(kv[1]).matches())
                    .map(kv -> kv[0] + ": " + kv[1])
                    .collect(Collectors.joining("; "));
            if (style.isEmpty()) el.removeAttr("style"); else el.attr("style", style);
        }
        // 스타일이 없는 span 은 의미 없으므로 언래핑
        for (Element span : doc.select("span:not([style])")) span.unwrap();

        // 글 감싸기 이미지: data-float 는 left/right, style 은 width 10~100% 만
        // data: 주소는 이미지(png·jpeg·gif·webp·svg) base64 만 — data:text/html 등 다른 형식은 src 제거
        for (Element img : doc.select("img")) {
            String src = img.attr("src");
            if (src.regionMatches(true, 0, "data:", 0, 5) && !DATA_IMAGE.matcher(src).lookingAt()) img.removeAttr("src");
            String f = img.attr("data-float");
            if (!f.equals("left") && !f.equals("right")) img.removeAttr("data-float");
            var m = IMG_WIDTH.matcher(Arrays.stream(img.attr("style").split(";")).map(String::trim)
                    .filter(d -> d.startsWith("width")).findFirst().orElse(""));
            int w = m.matches() ? Integer.parseInt(m.group(1)) : 0;
            if (w >= 10 && w <= 100) img.attr("style", "width: " + w + "%"); else img.removeAttr("style");
        }

        // 이미지+글 배치 블록: 속성·칸 정리 (아래 div 일괄 처리보다 먼저)
        for (Element box : doc.select("div[data-type=layout]")) cleanLayout(box);

        // 인용 스타일: box(박스)·quote(따옴표)만, 세로선(line)은 기본값이라 속성 없음
        for (Element q : doc.select("blockquote[data-style]")) {
            if (!java.util.Set.of("box", "quote").contains(q.attr("data-style"))) q.removeAttr("data-style");
        }

        // 버튼 링크: data-role=button 일 때만 data-style 허용
        for (Element a : doc.select("a")) {
            if (!"button".equals(a.attr("data-role"))) BUTTON_ATTRS.forEach(a::removeAttr);
            else cleanButton(a);
        }
        // iframe 은 유튜브 블록 안의 embed 주소만 허용
        Pattern yt = Pattern.compile("^https://www\\.(youtube|youtube-nocookie)\\.com/embed/([A-Za-z0-9_-]{11})([?#].*)?$");
        for (Element f : doc.select("iframe")) {
            var m = yt.matcher(f.attr("src"));
            boolean inBlock = f.parent() != null && "youtube".equals(f.parent().attr("data-type"));
            if (!inBlock || !m.matches()) { f.remove(); continue; }
            f.empty(); // iframe 안 내용은 쓰이지 않음 — 남기면 저장할 때마다 escape 가 겹쳐 늘어남
            f.clearAttributes();
            f.attr("src", "https://www.youtube-nocookie.com/embed/" + m.group(2));
            f.attr("title", "YouTube video");
            f.attr("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
            f.attr("allowfullscreen", "");
        }
        // div 는 갤러리/유튜브/버튼 블록만 허용, 그 외는 p 로 치환
        for (Element div : doc.select("div")) {
            // 배치 블록과 그 칸은 cleanLayout 에서 처리
            if ("layout".equals(div.attr("data-type"))) continue;
            if (div.hasAttr("data-cell") && div.parent() != null && "layout".equals(div.parent().attr("data-type"))) continue;
            if ("slider".equals(div.attr("data-type"))) {
                for (Element child : div.children()) {
                    boolean isTitle = child.tagName().equals("p") && "title".equals(child.attr("data-role")) && !child.text().isBlank();
                    if (!isTitle && !child.tagName().equals("img")) child.remove();
                }
                div.textNodes().forEach(org.jsoup.nodes.Node::remove);
                int iv = parseIntOr(div.attr("data-interval"), 3000);
                div.attr("data-interval", String.valueOf(iv < 0 || iv > 60000 ? 3000 : iv));
                if (!java.util.Set.of("16:9", "4:3", "1:1", "21:9").contains(div.attr("data-ratio"))) div.attr("data-ratio", "16:9");
                if (!java.util.Set.of("dots", "numbers", "bars", "none").contains(div.attr("data-indicator"))) div.attr("data-indicator", "dots");
                if (!java.util.Set.of("bottom-center", "bottom-left", "bottom-right").contains(div.attr("data-indicator-pos"))) div.attr("data-indicator-pos", "bottom-center");
                if (!java.util.Set.of("100", "75", "50").contains(div.attr("data-width"))) div.attr("data-width", "100");
                String sa = div.attr("data-align");
                if (!sa.equals("left") && !sa.equals("center") && !sa.equals("right")) div.attr("data-align", "center");
                continue;
            }
            if ("buttons".equals(div.attr("data-type"))) {
                for (Element child : div.children()) if (!child.tagName().equals("a")) child.remove();
                div.textNodes().forEach(org.jsoup.nodes.Node::remove);
                for (Element a : div.children()) { a.attr("data-role", "button"); if (a.attr("data-style").isEmpty()) a.attr("data-style", "primary"); }
                if (div.children().isEmpty()) { div.remove(); continue; }
                String a = div.attr("data-align");
                if (!a.equals("left") && !a.equals("center") && !a.equals("right")) div.attr("data-align", "center");
                continue;
            }
            if ("map".equals(div.attr("data-type"))) { cleanMap(div); continue; }
            if ("youtube".equals(div.attr("data-type"))) {
                if (div.selectFirst("> iframe") == null) { div.remove(); continue; }
                for (Element child : div.children()) if (!child.tagName().equals("iframe")) child.remove();
                div.textNodes().forEach(org.jsoup.nodes.Node::remove);
                String w = div.attr("data-width");
                if (!w.equals("100") && !w.equals("75") && !w.equals("50")) div.attr("data-width", "100");
                String a = div.attr("data-align");
                if (!a.equals("left") && !a.equals("center") && !a.equals("right")) div.attr("data-align", "center");
                continue;
            }
            if (!"gallery".equals(div.attr("data-type"))) { div.tagName("p"); div.clearAttributes(); continue; }
            // data-cols 는 예전 cover 갤러리 호환용 — 있을 때만 1~6 으로 맞춰 남긴다
            int cols = parseIntOr(div.attr("data-cols"), 0);
            if (cols == 0) div.removeAttr("data-cols");
            else div.attr("data-cols", String.valueOf(Math.max(1, Math.min(6, cols))));
            if (!"1".equals(div.attr("data-auto"))) div.removeAttr("data-auto");
            String layout = div.attr("data-layout");
            if (!layout.equals("justify") && !layout.equals("cover")) div.removeAttr("data-layout");
            String align = div.attr("data-align");
            if (!align.equals("center") && !align.equals("right")) div.removeAttr("data-align");
            for (Element child : div.children()) {
                boolean isTitle = child.tagName().equals("p") && "title".equals(child.attr("data-role")) && !child.text().isBlank();
                boolean isImg = child.tagName().equals("img");
                if (!isTitle && !isImg) child.remove();
            }
            div.textNodes().forEach(org.jsoup.nodes.Node::remove);
        }
        // 갤러리·슬라이드 제목 밖의 data-role 은 제거
        for (Element p : doc.select("p[data-role]")) {
            if (p.parent() == null || !TITLED_BLOCKS.contains(p.parent().attr("data-type"))) p.removeAttr("data-role");
        }
        return doc.body().html();
    }

    /**
     * 카카오 지도(퍼가기) 블록 정리: 안의 내용은 버리고 속성만 남긴다 (지도는 조회 화면의 뷰어 런타임이 그림).
     * timestamp 는 숫자 10~16자리, key 는 영문·숫자 2~32자 — 둘 중 하나라도 틀리면 둘 다 지운다(빈 블록, 조회 화면에서 숨김).
     * 높이는 300·400·500 (기본 400), 장소명은 공백 정리 후 100자까지. (클라이언트 Sanitizer 와 같은 규칙)
     */
    private static void cleanMap(Element div) {
        String ts = div.attr("data-timestamp"), key = div.attr("data-key");
        String h = div.attr("data-height");
        String title = div.attr("data-title").replaceAll("(?U)\\s+", " ").strip(); // (?U): 유니코드 공백까지 (클라이언트 \s 와 같게)
        div.empty();
        div.clearAttributes();
        div.attr("data-type", "map");
        div.attr("data-provider", "kakao-roughmap");
        if (MAP_TIMESTAMP.matcher(ts).matches() && MAP_KEY.matcher(key).matches()) {
            div.attr("data-timestamp", ts);
            div.attr("data-key", key);
        }
        div.attr("data-height", java.util.Set.of("300", "400", "500").contains(h) ? h : "400");
        if (!title.isEmpty()) div.attr("data-title", title.length() > 100 ? title.substring(0, 100) : title);
    }

    /**
     * 배치 블록 정리: preset·variant 는 허용 값(아니면 기본값), split 은 20~80 의 5 배수만.
     * 칸은 variant 의 저장 순서대로 다시 세우고, 모자라면 빈 칸을 채우고 넘치면 버린다.
     * 이미지 칸은 img 1장만, 글 칸에는 표·이미지·iframe·블록(data-type div)을 넣지 않는다.
     */
    private void cleanLayout(Element box) {
        new java.util.ArrayList<>(box.attributes().asList()).forEach(a -> { if (!LAYOUT_ATTRS.contains(a.getKey())) box.removeAttr(a.getKey()); });
        String preset = LAYOUT_CELLS.containsKey(box.attr("data-preset")) ? box.attr("data-preset") : "side";
        box.attr("data-preset", preset);
        var variants = LAYOUT_CELLS.get(preset);
        String variant = variants.containsKey(box.attr("data-variant")) ? box.attr("data-variant") : LAYOUT_DEFAULT_VARIANT.get(preset);
        box.attr("data-variant", variant);
        int split = parseIntOr(box.attr("data-split"), 0);
        if (split >= 20 && split <= 80 && split % 5 == 0) box.attr("data-split", String.valueOf(split)); else box.removeAttr("data-split");

        java.util.Deque<Element> images = new java.util.ArrayDeque<>(), texts = new java.util.ArrayDeque<>();
        for (Element c : box.children()) {
            if (!c.tagName().equals("div")) continue;
            if ("image".equals(c.attr("data-cell"))) images.add(c);
            else if ("text".equals(c.attr("data-cell"))) texts.add(c);
        }
        box.empty();
        for (char k : variants.get(variant).toCharArray()) {
            Element cell = k == 'i' ? images.poll() : texts.poll();
            if (cell == null) cell = new Element("div");
            Element img = k == 'i' ? cell.selectFirst("img") : null;
            if (k == 'i') cell.empty(); else cell.select("table, img, iframe, div[data-type]").remove();
            cell.clearAttributes();
            cell.attr("data-cell", k == 'i' ? "image" : "text");
            if (img != null) cell.appendChild(img);
            box.appendChild(cell);
        }
    }

    /**
     * 버튼 링크 속성 정리: 모양·테마 색·아이콘은 허용 값만, 직접 색은 style 의 --jm-btn(#hex) 만 남기고
     * data-tone 은 그 색의 밝기로 다시 계산 (클라이언트 Sanitizer 와 같은 규칙)
     */
    private void cleanButton(Element a) {
        if (!BUTTON_SHAPES.contains(a.attr("data-style"))) a.attr("data-style", "primary");
        if (!java.util.Set.of("sm", "lg").contains(a.attr("data-size"))) a.removeAttr("data-size");
        if (!BUTTON_COLORS.contains(a.attr("data-color"))) a.removeAttr("data-color");
        if (!BUTTON_ICONS.contains(a.attr("data-icon"))) a.removeAttr("data-icon");
        if (!a.hasAttr("data-icon") || !"right".equals(a.attr("data-icon-pos"))) a.removeAttr("data-icon-pos");
        a.removeAttr("data-tone");
        var m = BUTTON_COLOR.matcher(a.attr("style"));
        a.removeAttr("style");
        if (m.find()) {
            String hex = m.group(1).toLowerCase();
            if (hex.length() == 4) hex = "#" + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2) + hex.charAt(3) + hex.charAt(3);
            a.removeAttr("data-color"); // 직접 색이 테마 색보다 우선
            a.attr("style", "--jm-btn: " + hex);
            if (isLightColor(hex)) a.attr("data-tone", "light");
        }
    }

    /** 흰 글자 대비 4.5:1 미만인 밝은 색인지 (WCAG 상대 휘도 > 0.183) */
    private static boolean isLightColor(String hex) {
        double[] c = new double[3];
        for (int i = 0; i < 3; i++) {
            double v = Integer.parseInt(hex.substring(1 + i * 2, 3 + i * 2), 16) / 255.0;
            c[i] = v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.183;
    }

    private static int parseIntOr(String s, int def) {
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return def; }
    }
}
