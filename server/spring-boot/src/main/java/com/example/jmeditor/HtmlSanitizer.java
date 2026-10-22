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
            .addAttributes("a", "href", "target", "rel", "data-role", "data-style", "data-size")
            .addAttributes("img", "src", "alt", "width", "height", "data-float", "style")   // 글 감싸기: 방향 + 폭(%)
            .addAttributes("p", "style")
            .addAttributes("h1", "style").addAttributes("h2", "style").addAttributes("h3", "style")
            .addAttributes("li", "style").addAttributes("blockquote", "style")
            .addAttributes("ul", "style")
            .addAttributes("ol", "style", "start")
            .addAttributes("table", "style", "data-border")
            .addAttributes("col", "style")
            .addAttributes("tr", "style")
            .addAttributes("td", "style", "colspan", "rowspan")
            .addAttributes("th", "style", "colspan", "rowspan")
            .addAttributes("span", "style")
            .addAttributes("div", "data-type", "data-cols", "data-auto", "data-layout", "data-align", "data-width", "data-interval", "data-ratio", "data-indicator", "data-indicator-pos",
                           "data-preset", "data-variant", "data-split", "data-cell")   // 이미지+글 배치 블록
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

        // style 은 color / background-color 만 남김
        for (Element el : doc.select("[style]")) {
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
        for (Element img : doc.select("img")) {
            String f = img.attr("data-float");
            if (!f.equals("left") && !f.equals("right")) img.removeAttr("data-float");
            var m = IMG_WIDTH.matcher(Arrays.stream(img.attr("style").split(";")).map(String::trim)
                    .filter(d -> d.startsWith("width")).findFirst().orElse(""));
            int w = m.matches() ? Integer.parseInt(m.group(1)) : 0;
            if (w >= 10 && w <= 100) img.attr("style", "width: " + w + "%"); else img.removeAttr("style");
        }

        // 이미지+글 배치 블록: 속성·칸 정리 (아래 div 일괄 처리보다 먼저)
        for (Element box : doc.select("div[data-type=layout]")) cleanLayout(box);

        // 버튼 링크: data-role=button 일 때만 data-style 허용
        for (Element a : doc.select("a")) {
            if (!"button".equals(a.attr("data-role"))) { a.removeAttr("data-role"); a.removeAttr("data-style"); a.removeAttr("data-size"); }
            else {
                if (!java.util.Set.of("primary", "outline", "gray").contains(a.attr("data-style"))) a.attr("data-style", "primary");
                if (!java.util.Set.of("sm", "lg").contains(a.attr("data-size"))) a.removeAttr("data-size");
            }
        }
        // iframe 은 유튜브 블록 안의 embed 주소만 허용
        Pattern yt = Pattern.compile("^https://www\\.(youtube|youtube-nocookie)\\.com/embed/([A-Za-z0-9_-]{11})([?#].*)?$");
        for (Element f : doc.select("iframe")) {
            var m = yt.matcher(f.attr("src"));
            boolean inBlock = f.parent() != null && "youtube".equals(f.parent().attr("data-type"));
            if (!inBlock || !m.matches()) { f.remove(); continue; }
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

    private static int parseIntOr(String s, int def) {
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return def; }
    }
}
