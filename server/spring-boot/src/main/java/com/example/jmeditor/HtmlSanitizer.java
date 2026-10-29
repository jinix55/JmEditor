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

    /** 플러그인 블록 종류 — 구조 정책을 적용하지 않는다 (클라이언트 Sanitizer 의 PLUGIN_TYPES 와 같음) */
    private static final java.util.Set<String> PLUGIN_TYPES = java.util.Set.of("gallery", "slider", "buttons", "youtube", "layout", "map");
    /** th[scope] 허용 값 (구조 모드) */
    private static final java.util.Set<String> TH_SCOPES = java.util.Set.of("row", "col", "rowgroup", "colgroup");
    /** 클라이언트와 같은 태그 별칭 (b→strong 등) — 정제 전에 바꾼다 */
    private static final java.util.Map<String, String> TAG_ALIAS = java.util.Map.of("b", "strong", "i", "em", "strike", "s");

    /** 기본 허용 태그 (구조 정책 전) — 플러그인 안에서 구조 전용 태그를 가려낼 때 */
    private static final java.util.Set<String> BASE_TAGS = java.util.Set.of("p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "blockquote",
            "a", "img", "table", "tbody", "thead", "colgroup", "col", "tr", "td", "th", "span", "div", "iframe", "picture", "source");

    /** 요소가 플러그인 블록(div[data-type=gallery 등]) 안이거나 그 자체인지 */
    private static boolean insidePlugin(Element el) {
        for (Element a = el; a != null; a = a.parent()) {
            if (a.tagName().equals("div") && PLUGIN_TYPES.contains(a.attr("data-type"))) return true;
        }
        return false;
    }

    /** 퍼블 구조 정책 (꺼져 있으면 지금 규칙) */
    private final StructurePolicy policy;

    /** 구조 정책 없이 (예전 규칙 — class 제거·div→p). Spring 에서는 StructureConfig 의 정책(기본 켜짐)으로 만들어진다 */
    public HtmlSanitizer() {
        this(StructurePolicy.disabled());
    }

    /**
     * @param policy 퍼블 구조 정책 (StructureConfig 가 application.yml 에서 만든 빈)
     */
    @org.springframework.beans.factory.annotation.Autowired
    public HtmlSanitizer(StructurePolicy policy) {
        this.policy = policy == null ? StructurePolicy.disabled() : policy;
        this.safelist = baseSafelist();
        if (this.policy.enabled()) {
            // 구조 태그 + 모든 태그의 class(토큰 검사는 후처리) + th[scope]. 먼저 통과시켜야 후처리에서 고를 수 있다
            for (String t : this.policy.tags()) safelist.addTags(t).addAttributes(t, "style");
            safelist.addAttributes(":all", "class").addAttributes("th", "scope");
            // id·aria 4종(값 검사·중복 제거는 후처리), 아이콘 i(별칭 단계에서 아이콘만 i 로 남김 — class·aria-hidden 만)
            safelist.addAttributes(":all", "id").addAttributes(":all", StructurePolicy.ARIA_ATTRS.toArray(new String[0])).addTags("i");
        }
    }

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

    private final Safelist safelist;

    /** 기본 허용 목록 (구조 정책 전) */
    private static Safelist baseSafelist() {
        return new Safelist()
            .addTags("p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "blockquote",
                     "a", "img", "table", "tbody", "thead", "colgroup", "col", "tr", "td", "th", "span", "div", "iframe",
                     "picture", "source")   // 모바일 이미지: 구성·srcset·media·type 검사는 후처리(cleanPicture)
            .addAttributes("a", "href", "target", "rel", "data-role", "data-style", "data-size",
                           "data-color", "data-tone", "data-icon", "data-icon-pos", "style")   // 버튼: 색·아이콘 (값 검사는 cleanButton)
            .addAttributes("img", "src", "alt", "width", "height", "data-float", "style", "loading")   // 글 감싸기: 방향 + 폭(%), loading 은 lazy·eager 만(후처리)
            .addAttributes("source", "srcset", "media", "type")
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
            .addProtocols("a", "href", "http", "https", "mailto", "tel")
            .addProtocols("img", "src", "http", "https", "data")
            .preserveRelativeLinks(true);
    }

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

    /** 모바일 이미지(picture) 한도·형식 — 클라이언트 Sanitizer.js 와 같아야 한다 */
    private static final int PICTURE_SOURCE_MAX = 4, SRCSET_MAX = 4, MEDIA_MAX = 200;
    /** srcset 후보 하나: 주소(공백·쉼표 없음) + 선택 서술자(폭 640w 또는 배율 2x) */
    private static final Pattern SRCSET_CANDIDATE = Pattern.compile("^([^ ,]+)(?: (\\d+w|\\d+(?:\\.\\d+)?x))?$");
    /** data: 주소 후보(통째로 1개): 주소 + 선택 서술자 */
    private static final Pattern SRCSET_DATA_CANDIDATE = Pattern.compile("^([^ ]+)(?: (\\d+w|\\d+(?:\\.\\d+)?x))?$");
    /** img src 와 같은 허용 주소 (http(s)·/ 경로·이미지 base64 data:) */
    private static final Pattern SAFE_URL = Pattern.compile("^(https?:|/|data:image/(png|jpeg|jpg|gif|webp|svg\\+xml);base64,)", Pattern.CASE_INSENSITIVE);
    private static final Pattern MEDIA_CHARS = Pattern.compile("^[a-zA-Z0-9 \\t\\n\\f\\r():,.\\-]+$");
    private static final Pattern MEDIA_URL = Pattern.compile("url\\s*\\(", Pattern.CASE_INSENSITIVE);
    private static final Pattern SOURCE_TYPE = Pattern.compile("^image/(png|jpeg|gif|webp|avif|svg\\+xml)$");
    private static final Pattern CONTROL_CHARS = Pattern.compile("[\\u0000-\\u001f\\u007f]");

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
        // 태그 별칭: 클라이언트와 같게 b·i·strike → strong·em·s (Safelist 에 없어 글자만 남던 것을 맞춤)
        Document pre = Jsoup.parseBodyFragment(html);
        pre.outputSettings().prettyPrint(false); // 원문 공백 그대로
        TAG_ALIAS.forEach((from, to) -> {
            for (Element el : pre.select(from)) if (!(from.equals("i") && isIcon(el))) el.tagName(to);
        });
        String cleaned = Jsoup.clean(pre.body().html(), PROTOCOL_CHECK_BASE_URI, safelist, new Document.OutputSettings().prettyPrint(false));
        Document doc = Jsoup.parseBodyFragment(cleaned);

        // 구조 모드: class 는 허용 토큰만, th[scope] 는 허용 값만.
        // 플러그인 블록 안은 정책 없이(클라이언트와 같게): class 없음, 구조 전용 태그는 벗김 (div 는 아래 div 처리에서 p 로)
        if (policy.enabled()) {
            for (Element el : doc.select("[class]")) {
                String cls = insidePlugin(el) ? "" : policy.cleanClass(el.attr("class"));
                if (cls.isEmpty()) el.removeAttr("class"); else el.attr("class", cls);
            }
            for (String t : policy.tags()) {
                if (BASE_TAGS.contains(t)) continue;
                for (Element el : doc.select(t)) if (insidePlugin(el)) el.unwrap();
            }
            for (Element th : doc.select("th[scope]")) if (!TH_SCOPES.contains(th.attr("scope")) || insidePlugin(th)) th.removeAttr("scope");
            // id·aria: 정책 검사 통과분만. 플러그인 블록 안(자신 포함)에는 두지 않고, 아이콘 i 에는 aria-hidden 만 둔다 (클라이언트와 같게)
            for (Element el : doc.getAllElements()) {
                if (el == doc.body() || el.attributes().size() == 0) continue;
                boolean plugin = insidePlugin(el);
                boolean icon = el.tagName().equals("i"); // 별칭 단계에서 아이콘이 아닌 i 는 em 으로 바뀌었으므로 남은 i 는 아이콘
                if (el.hasAttr("id")) {
                    String id = plugin || icon ? "" : policy.cleanId(el.attr("id"));
                    if (id.isEmpty()) el.removeAttr("id"); else el.attr("id", id);
                }
                for (String name : StructurePolicy.ARIA_ATTRS) {
                    if (!el.hasAttr(name)) continue;
                    boolean drop = plugin || (icon && !name.equals("aria-hidden"));
                    String v = drop ? "" : policy.cleanAria(name, el.attr(name));
                    if (v.isEmpty()) el.removeAttr(name); else el.attr(name, v);
                }
            }
        }

        // 모바일 이미지(picture): 구성·source 검사 (img 처리보다 먼저 — 아래 img 루프가 남은 img 를 정리)
        // picture 직계가 아닌 source 는 모두 제거 (Safelist 는 source 를 어디서나 통과시키므로; 클라이언트는 언래핑되어 사라짐)
        for (Element src : new java.util.ArrayList<>(doc.select("source"))) if (src.parent() == null || !src.parent().tagName().equals("picture")) src.remove();
        for (Element pic : new java.util.ArrayList<>(doc.select("picture"))) cleanPicture(pic);

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
        // 속성이 하나도 남지 않은 span 은 의미 없으므로 언래핑
        // (구조 모드에서 class·id·aria 가 남은 span 은 둔다 — 아이콘·앵커 등)
        for (Element span : doc.select("span")) if (span.attributes().size() == 0) span.unwrap();

        // 글 감싸기 이미지: data-float 는 left/right, style 은 width 10~100% 만
        // data: 주소는 이미지(png·jpeg·gif·webp·svg) base64 만 — data:text/html 등 다른 형식은 src 제거
        for (Element img : doc.select("img")) {
            String src = img.attr("src");
            if (src.regionMatches(true, 0, "data:", 0, 5) && !DATA_IMAGE.matcher(src).lookingAt()) img.removeAttr("src");
            if (!img.attr("loading").equals("lazy") && !img.attr("loading").equals("eager")) img.removeAttr("loading");
            String f = img.attr("data-float");
            if (!f.equals("left") && !f.equals("right")) img.removeAttr("data-float");
            var m = IMG_WIDTH.matcher(Arrays.stream(img.attr("style").split(";")).map(String::trim)
                    .filter(d -> d.startsWith("width")).findFirst().orElse(""));
            int w = m.matches() ? Integer.parseInt(m.group(1)) : 0;
            if (w >= 10 && w <= 100) img.attr("style", "width: " + w + "%"); else img.removeAttr("style");
        }

        // 이미지+글 배치 블록: 속성·칸 정리 (아래 div 일괄 처리보다 먼저)
        for (Element box : doc.select("div[data-type=layout]")) cleanLayout(box);

        // 번호 목록 시작 번호: 숫자 1~4자리만 (클라이언트 Sanitizer 와 같게)
        for (Element ol : doc.select("ol[start]")) if (!ol.attr("start").matches("\\d{1,4}")) ol.removeAttr("start");

        // 인용 스타일: box(박스)·quote(따옴표)만, 세로선(line)은 기본값이라 속성 없음
        for (Element q : doc.select("blockquote[data-style]")) {
            if (!java.util.Set.of("box", "quote").contains(q.attr("data-style"))) q.removeAttr("data-style");
        }

        // 버튼 링크: data-role=button 일 때만 data-style 허용
        for (Element a : doc.select("a")) {
            applyLinkTarget(a);
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
            // 구조 모드: 플러그인이 아닌 div 는 그대로 두고 class·style 만 남긴다
            if (policy.tags().contains("div") && !PLUGIN_TYPES.contains(div.attr("data-type")) && !insidePlugin(div)) {
                String cls = div.attr("class"), st = div.attr("style");
                org.jsoup.nodes.Attributes keep = idAria(div);
                div.clearAttributes();
                if (!cls.isEmpty()) div.attr("class", cls);
                if (!st.isEmpty()) div.attr("style", st);
                div.attributes().addAll(keep);
                continue;
            }
            if (!"gallery".equals(div.attr("data-type"))) {
                // p 로 바꿀 때 id·aria 는 남긴다 (위에서 검사 끝, 플러그인 안이면 이미 없음 — 클라이언트 div→p 와 같게)
                org.jsoup.nodes.Attributes keep = idAria(div);
                div.tagName("p"); div.clearAttributes(); div.attributes().addAll(keep);
                continue;
            }
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
        // 같은 id 는 문서 순서상 첫 번째만 (대소문자가 다르면 다른 id — 클라이언트 Sanitizer.dedupeIds 와 같게)
        java.util.Set<String> seenIds = new java.util.HashSet<>();
        for (Element el : doc.select("[id]")) if (!seenIds.add(el.attr("id"))) el.removeAttr("id");
        // 최상위 공백 텍스트(블록 사이 줄바꿈 등)는 지운다 — 클라이언트 Sanitizer 와 같게
        for (org.jsoup.nodes.TextNode tn : new java.util.ArrayList<>(doc.body().textNodes())) if (tn.isBlank()) tn.remove();
        // 줄 맞춤(pretty print) 없이 — 켜 두면 dt·dd·div·caption 처럼 글만 있는 블록 안에 줄바꿈·들여쓰기가 들어가 글자가 바뀐다
        doc.outputSettings().prettyPrint(false);
        return doc.body().html();
    }

    /**
     * 링크 종류에 맞게 target·rel 을 맞춘다 (클라이언트 Sanitizer.applyLinkTarget 과 같게):
     * 주소가 #·tel:·mailto: (대소문자 무시)로 시작하면 두 속성을 없애고, 그 밖에는 새 창 + noopener 로 둔다.
     * href 가 없는 a 도 새 창 쪽으로 둔다(클라이언트도 href 없으면 같은 규칙). 앞뒤 공백은 JS trim 과 같게 자른다(NBSP 포함).
     */
    private static void applyLinkTarget(Element a) {
        String href = StructurePolicy.jsTrim(a.attr("href")).toLowerCase(java.util.Locale.ROOT); // JS trim 과 같게 (앞 NBSP 도 자름)
        if (href.startsWith("#") || href.startsWith("tel:") || href.startsWith("mailto:")) {
            a.removeAttr("target");
            a.removeAttr("rel");
        } else {
            a.attr("rel", "noopener noreferrer");
            a.attr("target", "_blank");
        }
    }

    /** 요소의 id·aria(4종) 속성만 복사 (이미 검사를 마친 값 — clearAttributes 전에 보관용) */
    private static org.jsoup.nodes.Attributes idAria(Element el) {
        org.jsoup.nodes.Attributes a = new org.jsoup.nodes.Attributes();
        if (el.hasAttr("id")) a.put("id", el.attr("id"));
        for (String n : StructurePolicy.ARIA_ATTRS) if (el.hasAttr(n)) a.put(n, el.attr(n));
        return a;
    }

    /**
     * 구조 모드 아이콘 i 인지 (클라이언트 Sanitizer.#iconI 와 같은 판정): 플러그인 블록 밖, class 허용 토큰이 남고,
     * 안의 글(script·style 내용 포함 — 브라우저 textContent 와 같게)이 공백뿐
     */
    private boolean isIcon(Element i) {
        if (!policy.enabled() || insidePlugin(i) || policy.cleanClass(i.attr("class")).isEmpty()) return false;
        StringBuilder sb = new StringBuilder();
        org.jsoup.select.NodeTraversor.traverse((node, depth) -> {
            if (node instanceof org.jsoup.nodes.TextNode t) sb.append(t.getWholeText());
            else if (node instanceof org.jsoup.nodes.DataNode d) sb.append(d.getWholeData());
        }, i);
        return StructurePolicy.isJsBlank(sb.toString());
    }

    /**
     * picture 정리 (클라이언트 Sanitizer.#cleanPicture 와 같은 규칙): 자식은 source(최대 4개, 규칙 통과분) 다음 img 1개.
     * img 가 없으면 통째로 버리고, img 뒤의 자식은 버린다. 남는 source 가 없으면 picture 를 벗기고 img 만 남긴다.
     * 갤러리·슬라이드 블록의 직계 picture 는 img 한 장으로 줄인다(블록은 img 만 다룸).
     * class 는 앞 단계(구조 정책)에서 이미 걸러졌으므로 그대로 둔다.
     */
    private static void cleanPicture(Element pic) {
        Element img = null;
        java.util.List<Element> sources = new java.util.ArrayList<>();
        for (Element c : pic.children()) {
            if (c.tagName().equals("img")) { img = c; break; }
            if (c.tagName().equals("source") && sources.size() < PICTURE_SOURCE_MAX) {
                Element s = cleanSource(c);
                if (s != null) sources.add(s);
            }
        }
        if (img == null) { pic.remove(); return; }
        Element parent = pic.parent();
        boolean inBlock = parent != null && parent.tagName().equals("div")
                && ("gallery".equals(parent.attr("data-type")) || "slider".equals(parent.attr("data-type")));
        if (sources.isEmpty() || inBlock) {
            pic.before(img); // img 를 picture 밖으로 옮김
            pic.remove();
            return;
        }
        String cls = pic.attr("class");
        org.jsoup.nodes.Attributes keep = idAria(pic);
        pic.empty();
        pic.clearAttributes();
        if (!cls.isEmpty()) pic.attr("class", cls);
        pic.attributes().addAll(keep);
        sources.forEach(pic::appendChild);
        pic.appendChild(img);
    }

    /** source 정리: srcset(필수)·media 가 규칙에 어긋나면 null(버림), type 이 어긋나면 속성만 지운다. 새 source 요소를 돌려준다. */
    private static Element cleanSource(Element node) {
        String srcset = cleanSrcset(node.attr("srcset"));
        if (srcset == null) return null;
        String media = node.attr("media");
        if (!media.isEmpty() && !isSafeMedia(media)) return null;
        String type = node.attr("type");
        Element s = new Element("source");
        if (!media.isEmpty()) s.attr("media", media);
        s.attr("srcset", srcset);
        if (SOURCE_TYPE.matcher(type).matches()) s.attr("type", type);
        return s;
    }

    /**
     * srcset 값 검사·정규화 (클라이언트 Sanitizer.cleanSrcset 과 같음): 후보 1~4개(", " 로 구분), 후보 = 주소 + 선택 서술자(640w·2x).
     * 주소는 img src 와 같은 허용 형식, data: 주소는 후보가 1개일 때만. 제어 문자·어긋난 후보가 하나라도 있으면 null.
     */
    static String cleanSrcset(String value) {
        String raw = value == null ? "" : value;
        if (CONTROL_CHARS.matcher(raw).find()) return null;
        String v = raw.replaceAll("^ +| +$", "");
        if (v.isEmpty()) return null;
        if (v.regionMatches(true, 0, "data:", 0, 5)) {
            var m = SRCSET_DATA_CANDIDATE.matcher(v);
            if (!m.matches() || !SAFE_URL.matcher(m.group(1)).find() || m.group(1).chars().filter(ch -> ch == ',').count() != 1) return null;
            return m.group(2) != null ? m.group(1) + " " + m.group(2) : m.group(1);
        }
        String[] cands = v.split(", +", -1);
        if (cands.length > SRCSET_MAX) return null;
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String c0 : cands) {
            var m = SRCSET_CANDIDATE.matcher(c0.replaceAll("^ +| +$", ""));
            if (!m.matches() || !SAFE_URL.matcher(m.group(1)).find() || m.group(1).regionMatches(true, 0, "data:", 0, 5)) return null;
            out.add(m.group(2) != null ? m.group(1) + " " + m.group(2) : m.group(1));
        }
        return String.join(", ", out);
    }

    /** source[media] 검사 (클라이언트 Sanitizer.isSafeMedia 와 같음): 200자 이하, 영문·숫자·공백·( ) : , . - 만, url( 금지 */
    static boolean isSafeMedia(String v) {
        return !v.isEmpty() && v.length() <= MEDIA_MAX && MEDIA_CHARS.matcher(v).matches() && !MEDIA_URL.matcher(v).find();
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
            if (k == 'i') cell.empty(); else cell.select("table, picture, img, iframe, div[data-type]").remove();
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
