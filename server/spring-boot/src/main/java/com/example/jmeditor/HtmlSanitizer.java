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

    /** style 속성에서 허용하는 CSS 속성 */
    private static final java.util.Set<String> ALLOWED_STYLE = java.util.Set.of("color", "background-color");
    /** 색상 값 형식: #hex, rgb(a)(), 색 이름 */
    private static final Pattern SAFE_COLOR = Pattern.compile("^(#[0-9a-fA-F]{3,8}|rgba?\\([\\d\\s.,%]+\\)|[a-zA-Z]+)$");

    private final Safelist safelist = new Safelist()
            .addTags("p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "blockquote",
                     "a", "img", "table", "tbody", "thead", "tr", "td", "th", "span", "div")
            .addAttributes("a", "href", "target", "rel")
            .addAttributes("img", "src", "alt", "width", "height")
            .addAttributes("td", "style", "colspan", "rowspan")
            .addAttributes("th", "style", "colspan", "rowspan")
            .addAttributes("span", "style")
            .addAttributes("div", "data-type", "data-cols", "data-auto", "data-layout", "data-align")   // 이미지 갤러리 블록
            .addAttributes("p", "data-role")                                 // 갤러리 제목
            .addProtocols("a", "href", "http", "https", "mailto")
            .addProtocols("img", "src", "http", "https", "data")
            .addEnforcedAttribute("a", "rel", "noopener noreferrer")
            .addEnforcedAttribute("a", "target", "_blank")
            .preserveRelativeLinks(true);

    /**
     * @param html 클라이언트에서 받은 HTML
     * @return 허용 태그/속성만 남긴 HTML
     */
    public String clean(String html) {
        if (html == null || html.isBlank()) return "";
        String cleaned = Jsoup.clean(html, "", safelist, new Document.OutputSettings().prettyPrint(false));
        Document doc = Jsoup.parseBodyFragment(cleaned);

        // style 은 color / background-color 만 남김
        for (Element el : doc.select("[style]")) {
            String style = Arrays.stream(el.attr("style").split(";"))
                    .map(d -> d.split(":", 2))
                    .filter(kv -> kv.length == 2)
                    .map(kv -> new String[]{kv[0].trim().toLowerCase(), kv[1].trim()})
                    .filter(kv -> ALLOWED_STYLE.contains(kv[0]) && SAFE_COLOR.matcher(kv[1]).matches())
                    .map(kv -> kv[0] + ": " + kv[1])
                    .collect(Collectors.joining("; "));
            if (style.isEmpty()) el.removeAttr("style"); else el.attr("style", style);
        }
        // 스타일이 없는 span 은 의미 없으므로 언래핑
        for (Element span : doc.select("span:not([style])")) span.unwrap();

        // div 는 갤러리 블록만 허용, 그 외는 p 로 치환. 갤러리 안에는 제목 p 와 img 만
        for (Element div : doc.select("div")) {
            if (!"gallery".equals(div.attr("data-type"))) { div.tagName("p"); div.clearAttributes(); continue; }
            int cols = parseIntOr(div.attr("data-cols"), 3);
            div.attr("data-cols", String.valueOf(Math.max(1, Math.min(6, cols))));
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
        // 갤러리 밖의 data-role 은 제거
        for (Element p : doc.select("p[data-role]")) {
            if (p.parent() == null || !"gallery".equals(p.parent().attr("data-type"))) p.removeAttr("data-role");
        }
        return doc.body().html();
    }

    private static int parseIntOr(String s, int def) {
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return def; }
    }
}
