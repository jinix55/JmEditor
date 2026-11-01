package com.example.jmeditor;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.regex.Pattern;

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
    private static final java.util.Map<String, String> TAG_ALIAS = java.util.Map.of("b", "strong", "i", "em", "strike", "s", "font", "span");

    /** 기본 허용 태그 (구조 정책 전) — 플러그인 안에서 구조 전용 태그를 가려낼 때 */
    private static final java.util.Set<String> BASE_TAGS = java.util.Set.of("hr", "p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
            "a", "img", "table", "tbody", "thead", "colgroup", "col", "tr", "td", "th", "span", "div", "iframe", "picture", "source");

    /** 가로줄을 담을 수 없는 요소: 문단·제목·글자 서식 — 저장 HTML 을 다시 파싱하면 구조가 바뀌므로 hr 을 밖으로 꺼낸다 (클라이언트 HR_SPLIT_TAGS 와 같음) */
    private static final java.util.Set<String> HR_SPLIT_TAGS = java.util.Set.of("p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "u", "s", "span", "a", "small", "sub", "sup");

    /** 요소가 플러그인 블록(div[data-type=gallery 등]) 안이거나 그 자체인지 */
    private static boolean insidePlugin(Element el) {
        for (Element a = el; a != null; a = a.parent()) {
            if (a.tagName().equals("div") && PLUGIN_TYPES.contains(a.attr("data-type"))) return true;
        }
        return false;
    }

    /** 퍼블 구조 정책 (꺼져 있으면 지금 규칙) */
    private final StructurePolicy policy;
    /** 글꼴 허용 목록 */
    private final FontPolicy fonts;

    /** 구조 정책 없이 (예전 규칙 — class 제거·div→p). Spring 에서는 StructureConfig 의 정책(기본 켜짐)으로 만들어진다 */
    public HtmlSanitizer() {
        this(StructurePolicy.disabled());
    }

    /**
     * @param policy 퍼블 구조 정책 (글꼴은 기본 목록)
     */
    public HtmlSanitizer(StructurePolicy policy) {
        this(policy, FontPolicy.defaults());
    }

    /**
     * @param policy 퍼블 구조 정책 (StructureConfig 가 application.yml 에서 만든 빈)
     * @param fonts 글꼴 허용 목록 (FontConfig 가 application.yml 에서 만든 빈)
     */
    @org.springframework.beans.factory.annotation.Autowired
    public HtmlSanitizer(StructurePolicy policy, FontPolicy fonts) {
        this.policy = policy == null ? StructurePolicy.disabled() : policy;
        this.fonts = fonts == null ? FontPolicy.defaults() : fonts;
        this.safelist = baseSafelist();
        if (this.policy.enabled()) {
            // 구조 태그 + 모든 태그의 class(토큰 검사는 후처리) + th[scope]. 먼저 통과시켜야 후처리에서 고를 수 있다
            for (String t : this.policy.tags()) safelist.addTags(t).addAttributes(t, "style");
            safelist.addAttributes(":all", "class").addAttributes("th", "scope");
            // id·aria 4종(값 검사·중복 제거는 후처리), 아이콘 i(별칭 단계에서 아이콘만 i 로 남김 — class·aria-hidden 만)
            safelist.addAttributes(":all", "id").addAttributes(":all", StructurePolicy.ARIA_ATTRS.toArray(new String[0])).addTags("i");
        }
    }

    /** style 속성에서 허용하는 CSS 속성과 값 형식 (클라이언트 Sanitizer 와 동일). 글꼴·글자 크기·테두리·background 는 먼저 LegacyFormat 이 처리 */
    private static final java.util.Map<String, Pattern> ALLOWED_STYLE = java.util.Map.of(
            "color", LegacyFormat.SAFE_COLOR,
            "background-color", LegacyFormat.SAFE_COLOR,
            "text-align", Pattern.compile("^(left|center|right|justify)$", Pattern.CASE_INSENSITIVE),
            "vertical-align", Pattern.compile("^(top|middle|bottom)$", Pattern.CASE_INSENSITIVE),
            "width", Pattern.compile("^(\\d+(\\.\\d+)?(px|%)|auto)$", Pattern.CASE_INSENSITIVE),
            "height", Pattern.compile("^\\d+(\\.\\d+)?px$", Pattern.CASE_INSENSITIVE),
            "list-style-type", Pattern.compile("^(disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-roman|upper-roman|hangul|hangul-consonant|none)$", Pattern.CASE_INSENSITIVE));

    private final Safelist safelist;

    /** 기본 허용 목록 (구조 정책 전) */
    private static Safelist baseSafelist() {
        return new Safelist()
            .addTags("hr", "p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
                     "a", "img", "table", "tbody", "thead", "colgroup", "col", "tr", "td", "th", "span", "div", "iframe",
                     "picture", "source")   // 모바일 이미지: 구성·srcset·media·type 검사는 후처리(cleanPicture)
            .addAttributes("a", "href", "target", "rel", "data-role", "data-style", "data-size",
                           "data-color", "data-tone", "data-icon", "data-icon-pos", "style")   // 버튼: 색·아이콘 (값 검사는 cleanButton)
            .addAttributes("img", "src", "alt", "width", "height", "data-float", "style", "loading")   // 글 감싸기: 방향 + 폭(%), loading 은 lazy·eager 만(후처리)
            .addAttributes("source", "srcset", "media", "type")
            .addAttributes("p", "style")
            .addAttributes("h1", "style").addAttributes("h2", "style").addAttributes("h3", "style").addAttributes("h4", "style").addAttributes("h5", "style").addAttributes("h6", "style")
            .addAttributes("li", "style").addAttributes("blockquote", "style", "data-style")   // 인용 스타일: box·quote (세로선은 기본값)
            .addAttributes("ul", "style")
            .addAttributes("ol", "style", "start")
            .addAttributes("table", "style", "data-border")
            .addAttributes("col", "style", "span")
            .addAttributes("tr", "style")
            .addAttributes("td", "style", "colspan", "rowspan")
            .addAttributes("th", "style", "colspan", "rowspan")
            .addAttributes("span", "style")
            .addAttributes("div", "style", "data-type", "data-cols", "data-auto", "data-layout", "data-align", "data-width", "data-interval", "data-ratio", "data-indicator", "data-indicator-pos",
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

    /** 모바일 이미지(picture) 한도·형식 — 클라이언트 Sanitizer.js 와 같아야 한다 */
    private static final int PICTURE_SOURCE_MAX = 4, SRCSET_MAX = 4, MEDIA_MAX = 200;
    /** srcset 후보 하나: 주소(공백·쉼표 없음) + 선택 서술자(폭 640w 또는 배율 2x) */
    private static final Pattern SRCSET_CANDIDATE = Pattern.compile("^([^ ,]+)(?: (\\d+w|\\d+(?:\\.\\d+)?x))?$");
    /** data: 주소 후보(통째로 1개): 주소 + 선택 서술자 */
    private static final Pattern SRCSET_DATA_CANDIDATE = Pattern.compile("^([^ ]+)(?: (\\d+w|\\d+(?:\\.\\d+)?x))?$");
    /** img src·srcset 허용 주소: http(s)://, / 로 시작하는 내부 경로(// 와 /\\ 제외), 이미지 base64 data: (클라이언트 SAFE_URL 과 같음) */
    private static final Pattern SAFE_URL = Pattern.compile("^(https?://|/(?![/\\\\])|data:image/(png|jpeg|jpg|gif|webp|svg\\+xml);base64,)", Pattern.CASE_INSENSITIVE);
    /** href 허용 주소: http(s)://, mailto:, tel:, #, / 로 시작하는 내부 경로(// 와 /\\ 제외) (클라이언트 SAFE_HREF 와 같음) */
    private static final Pattern SAFE_HREF = Pattern.compile("^(https?://|mailto:|tel:|#|/(?![/\\\\]))", Pattern.CASE_INSENSITIVE);
    /** href·srcset(data: 제외) 값 길이 상한 — 넘으면 그 속성(srcset 은 그 source)을 버린다 (클라이언트 URL_MAX 와 같음) */
    private static final int URL_MAX = 8192;
    /** 요소 중첩 깊이 상한 — 그보다 깊은 요소는 벗기고 글만 남긴다 (클라이언트 DEPTH_MAX 와 같음) */
    private static final int DEPTH_MAX = 256;
    private static final Pattern MEDIA_CHARS = Pattern.compile("^[a-zA-Z0-9 \\t\\n\\f\\r():,.\\-]+$");
    private static final Pattern MEDIA_URL = Pattern.compile("url\\s*\\(", Pattern.CASE_INSENSITIVE);
    private static final Pattern SOURCE_TYPE = Pattern.compile("^image/(png|jpeg|gif|webp|avif|svg\\+xml)$");
    private static final Pattern CONTROL_CHARS = Pattern.compile("[\\u0000-\\u001f\\u007f]");

    /** col span 허용 값: 1~1000 */
    private static final Pattern COL_SPAN = Pattern.compile("^([1-9]\\d{0,2}|1000)$");
    /** 파싱 전에 남기는 object·applet·marquee 여는 태그 수 합계 */
    private static final int BARRIER_TAGS_MAX = 2000;
    private static final java.util.List<String> BARRIER_TAGS = java.util.List.of("object", "applet", "marquee");

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
        // jsoup 은 object·applet·marquee 가 쌓이면 이차 시간(removeFromActiveFormattingElements)이라 파싱 전에 그 수만 제한한다.
        // 클라이언트 #limitOpenTags(순 열림 2만)와 기준이 달라 이 극단 입력에서는 결과가 다를 수 있다(허용)
        Document pre = Jsoup.parseBodyFragment(limitBarrierTags(dropUnclosedTags(html)));
        // 글까지 통째로 버린다: 문서 머리·폼 입력 글이 본문에 새지 않게 (클라이언트 DROP_TAGS 와 같음. Safelist 는 태그만 벗기고 글을 남김)
        pre.select("title, textarea, select").remove();
        pre.outputSettings().prettyPrint(false); // 원문 공백 그대로
        LegacyFormat.normalize(pre.body(), fonts, policy.tags().contains("caption")); // 옛 형식(font·표 옛 속성·font-weight) 변환 — 허용 검사 전에
        TAG_ALIAS.forEach((from, to) -> {
            for (Element el : pre.select(from)) if (!(from.equals("i") && isIcon(el))) el.tagName(to);
        });
        String cleaned = Jsoup.clean(pre.body().html(), PROTOCOL_CHECK_BASE_URI, safelist, new Document.OutputSettings().prettyPrint(false));
        Document doc = Jsoup.parseBodyFragment(cleaned);
        flattenDeep(doc.body());

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
            // 구조 모드가 아니거나 플러그인 안의 div 는 뒤에서 p 가 된다 — 클라이언트처럼 p 규칙으로 (들여쓰기)
            boolean toP = el.normalName().equals("div") && (!policy.tags().contains("div") || insidePlugin(el));
            String style = cleanStyle(el.attr("style"), toP ? "p" : el.normalName());
            if (style.isEmpty()) el.removeAttr("style"); else el.attr("style", style);
        }
        // 속성이 하나도 남지 않은 span 은 의미 없으므로 언래핑
        // (구조 모드에서 class·id·aria 가 남은 span 은 둔다 — 아이콘·앵커 등)
        unwrapBareSpans(doc.body());

        // 글 감싸기 이미지: data-float 는 left/right, style 은 width 10~100% 만
        // src 는 isSafeUrl 통과분만 — 외부 주소 우회(//·/\\)와 data:text/html 등 다른 data: 형식은 src 제거
        for (Element img : doc.select("img")) {
            if (img.hasAttr("src") && !isSafeUrl(img.attr("src"))) img.removeAttr("src");
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

        // col span: 1~1000 정수만 (클라이언트와 같게)
        for (Element col : doc.select("col[span]")) if (!COL_SPAN.matcher(col.attr("span")).matches()) col.removeAttr("span");

        // 인용 스타일: box(박스)·quote(따옴표)만, 세로선(line)은 기본값이라 속성 없음
        for (Element q : doc.select("blockquote[data-style]")) {
            if (!java.util.Set.of("box", "quote").contains(q.attr("data-style"))) q.removeAttr("data-style");
        }

        // 버튼 링크: data-role=button 일 때만 data-style 허용
        for (Element a : doc.select("a")) {
            if (a.hasAttr("href") && !isSafeHref(a.attr("href"))) a.removeAttr("href");
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
            if (PLUGIN_TYPES.contains(div.attr("data-type"))) div.removeAttr("style"); // 플러그인 블록에는 style 을 두지 않는다 (클라이언트와 같게)
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
                // p 로 바꿀 때 id·aria·style 은 남긴다 (위에서 검사 끝, 플러그인 안이면 이미 없음 — 클라이언트 div→p 와 같게)
                org.jsoup.nodes.Attributes keep = idAria(div);
                String st = div.attr("style");
                div.tagName("p"); div.clearAttributes(); div.attributes().addAll(keep);
                if (!st.isEmpty()) div.attr("style", st);
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
        settleHrs(doc.body());
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
     * 가로줄 자리 잡기 (클라이언트 #settleHrs 와 같은 규칙): 속성을 모두 지우고, 플러그인 블록 안이면 버리고,
     * 문단·제목·글자 서식 안이면 그 요소를 hr 앞뒤로 나눠 밖으로 꺼낸다 (비게 된 쪽은 지움). 뒤의 hr 부터 처리해 옮기는 노드가 hr 사이 구간뿐이다
     * @param root 본문
     */
    private static void settleHrs(Element root) {
        java.util.List<Element> hrs = new java.util.ArrayList<>(root.select("hr"));
        java.util.Collections.reverse(hrs);
        for (Element hr : hrs) {
            if (insidePlugin(hr)) { hr.remove(); continue; }
            hr.clearAttributes();
            while (hr.parent() != null && HR_SPLIT_TAGS.contains(hr.parent().normalName())) {
                Element before = hr.parent();
                Element after = before.shallowClone();
                java.util.List<org.jsoup.nodes.Node> tail = new java.util.ArrayList<>(before.childNodes().subList(hr.siblingIndex() + 1, before.childNodeSize()));
                after.insertChildren(0, tail);
                before.after(hr);
                hr.after(after);
                if (after.childNodeSize() == 0) after.remove();
                if (before.childNodeSize() == 0) before.remove();
            }
        }
    }

    /** 닫는 태그가 없으면 뒤 글을 통째로 삼키는 태그 */
    private static final java.util.regex.Pattern SWALLOW_TAG = java.util.regex.Pattern.compile(
            "<(/?)(textarea|title|select)(?=[ \\t\\n\\f\\r/>])[^>]*+>", java.util.regex.Pattern.CASE_INSENSITIVE);

    /**
     * 닫히지 않은 textarea·title·select 여는 태그만 지운다 (파서가 문서 끝까지 뒤 글을 그 안에 넣어 본문이 조용히 사라지는 것 방지). 클라이언트 #dropUnclosedTags 와 같은 규칙:
     * textarea·title 은 같은 이름의 닫는 태그가 뒤에 없으면 지우고, 있으면 거기까지 건너뛴다. select 는 닫는 태그 전에 다른 여는 태그가 오면 지운다.
     * 마지막 닫는 태그를 먼저 찾아 두어 선형 시간. 결과는 다시 파서·정제를 거치므로 보안 경계가 아니다.
     * @param html 입력
     * @return 해당 여는 태그를 뺀 문자열
     */
    static String dropUnclosedTags(String html) {
        java.util.List<int[]> tokens = new java.util.ArrayList<>(); // {닫힘 여부, 이름 번호, 시작, 끝}
        int[] lastClose = {-1, -1, -1};
        java.util.regex.Matcher m = SWALLOW_TAG.matcher(html).region(0, html.lastIndexOf('>') + 1);
        while (m.find()) {
            boolean close = !m.group(1).isEmpty();
            int name = switch (m.group(2).toLowerCase(java.util.Locale.ROOT)) { case "textarea" -> 0; case "title" -> 1; default -> 2; };
            tokens.add(new int[] {close ? 1 : 0, name, m.start(), m.end()});
            if (close) lastClose[name] = m.start();
        }
        final int select = 2;
        java.util.List<int[]> drops = new java.util.ArrayList<>();
        int[] inside = null; // 지금 열려 있는 태그
        for (int[] t : tokens) {
            boolean close = t[0] == 1;
            if (inside != null && inside[1] != select) {
                if (close && t[1] == inside[1]) inside = null;
                continue;
            }
            if (close) {
                if (t[1] == select) inside = null;
                continue;
            }
            if (inside != null) drops.add(inside); // select 안의 새 여는 태그
            inside = null;
            if (lastClose[t[1]] > t[2]) inside = t; else drops.add(t);
        }
        if (drops.isEmpty()) return html;
        StringBuilder out = new StringBuilder(html.length());
        int copied = 0;
        for (int[] t : drops) {
            out.append(html, copied, t[2]);
            copied = t[3];
        }
        return out.append(html, copied, html.length()).toString();
    }

    /**
     * object·applet·marquee 여는 태그를 합계 {@value #BARRIER_TAGS_MAX} 개까지만 남기고 지운다 (선형 스캔).
     * 주석·따옴표를 해석하지 않으며, 결과는 다시 파서·정제를 거치므로 보안 경계가 아니다.
     * @param html 입력
     * @return 초과분을 지운 문자열 (초과가 없으면 입력 그대로)
     */
    static String limitBarrierTags(String html) {
        StringBuilder out = null;
        int count = 0, copied = 0, i = 0;
        while ((i = html.indexOf('<', i)) >= 0) {
            int nameEnd = barrierNameEnd(html, i + 1);
            if (nameEnd < 0) { i++; continue; }
            int close = html.indexOf('>', nameEnd);
            if (close < 0) break; // 닫히지 않은 태그: 파서가 글로 다루거나 버린다
            if (++count > BARRIER_TAGS_MAX) {
                if (out == null) out = new StringBuilder(html.length());
                out.append(html, copied, i);
                copied = close + 1;
            }
            i = close + 1;
        }
        return out == null ? html : out.append(html, copied, html.length()).toString();
    }

    /** from 위치가 막는 태그 이름이면 이름 끝 위치, 아니면 -1 */
    private static int barrierNameEnd(String html, int from) {
        for (String name : BARRIER_TAGS) {
            int end = from + name.length();
            if (html.regionMatches(true, from, name, 0, name.length()) && end < html.length()) {
                char c = html.charAt(end);
                if (c == '>' || c == '/' || c == ' ' || c == '\t' || c == '\n' || c == '\f' || c == '\r') return end;
            }
        }
        return -1;
    }

    /**
     * 속성 없는 span 을 벗긴다. 부모별로 자식을 한 번에 다시 세운다 (Element.unwrap 을 하나씩 부르면 형제 수에 이차 시간).
     * @param root 문서 body
     */
    private static void unwrapBareSpans(Element root) {
        java.util.Set<Element> parents = new java.util.LinkedHashSet<>();
        for (Element span : root.select("span")) if (span.attributes().size() == 0 && span.parent() != null) parents.add(span.parent());
        for (Element p : parents) {
            java.util.List<org.jsoup.nodes.Node> out = new java.util.ArrayList<>();
            java.util.ArrayDeque<org.jsoup.nodes.Node> st = new java.util.ArrayDeque<>();
            java.util.List<org.jsoup.nodes.Node> kids = new java.util.ArrayList<>(p.childNodes());
            for (int i = kids.size() - 1; i >= 0; i--) st.push(kids.get(i));
            p.empty();
            while (!st.isEmpty()) {
                org.jsoup.nodes.Node n = st.pop();
                if (n instanceof Element e && e.normalName().equals("span") && e.attributes().size() == 0) {
                    java.util.List<org.jsoup.nodes.Node> c = new java.util.ArrayList<>(e.childNodes());
                    e.empty();
                    for (int i = c.size() - 1; i >= 0; i--) st.push(c.get(i));
                } else out.add(n);
            }
            p.appendChildren(out);
        }
    }

    /**
     * style 문자열 정리 (클라이언트 Sanitizer.cleanStyle 과 같음): 옛 형식 변환 후 허용 속성·값만 남긴다
     * @param style style 속성값
     * @param tag 그 style 을 가진 요소의 태그
     * @return 정리한 style (남는 것이 없으면 빈 문자열)
     */
    private String cleanStyle(String style, String tag) {
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String[] d : LegacyFormat.parseStyle(style)) {
            String[] legacy = LegacyFormat.cleanDecl(d[0], d[1], tag, fonts);
            if (legacy == null) continue;
            if (legacy != LegacyFormat.NOT_LEGACY) out.add(legacy[0] + ": " + legacy[1]);
            else if (ALLOWED_STYLE.containsKey(d[0]) && ALLOWED_STYLE.get(d[0]).matcher(d[1]).matches()) out.add(d[0] + ": " + d[1]);
        }
        return String.join("; ", out);
    }

    /**
     * 링크 주소가 허용 형식인지 (클라이언트 Sanitizer.isSafeHref 와 같음): 8192자 이하, 앞뒤 공백을 자른 뒤 제어 문자가 없고 SAFE_HREF 에 맞아야 한다.
     * @param url href 값
     * @return 남겨도 되면 true
     */
    static boolean isSafeHref(String url) {
        return url != null && url.length() <= URL_MAX && matchesSafe(url, SAFE_HREF);
    }

    /**
     * 이미지 주소가 허용 형식인지 (클라이언트 Sanitizer.isSafeUrl 과 같음): 앞뒤 공백을 자른 뒤 제어 문자가 없고 SAFE_URL 에 맞아야 한다.
     * @param url src 값
     * @return 남겨도 되면 true
     */
    static boolean isSafeUrl(String url) {
        return url != null && matchesSafe(url, SAFE_URL);
    }

    /** 앞뒤 공백(JS trim 기준)을 자른 값이 비어 있지 않고, 제어 문자가 없고, 주어진 형식으로 시작하는지 */
    private static boolean matchesSafe(String url, Pattern format) {
        String v = StructurePolicy.jsTrim(url);
        return !v.isEmpty() && !CONTROL_CHARS.matcher(v).find() && format.matcher(v).find();
    }

    /** 앞뒤 스페이스(U+0020)만 자른다 — 정규식(^ +| +$)은 공백이 길면 이차 시간이라 인덱스로 찾는다 */
    private static String trimSpaces(String s) {
        int from = 0, to = s.length();
        while (from < to && s.charAt(from) == ' ') from++;
        while (to > from && s.charAt(to - 1) == ' ') to--;
        return s.substring(from, to);
    }

    /**
     * 깊이 {@value #DEPTH_MAX} 인 요소 안의 자식 요소를 모두 벗겨 글만 남긴다 (클라이언트 Sanitizer.#cleanNode 의 깊이 상한과 같은 결과).
     * iframe 안의 글은 내용이 아니므로 버린다(클라이언트는 iframe 을 통째로 버림). 글 노드를 새로 만들어 붙여 형제 재정렬 비용이 들지 않게 한다.
     * @param body 문서 body
     */
    private static void flattenDeep(Element body) {
        java.util.List<Element> cut = new java.util.ArrayList<>();
        org.jsoup.select.NodeTraversor.traverse((node, depth) -> {
            if (depth == DEPTH_MAX && node instanceof Element e && e.firstElementChild() != null) cut.add(e);
        }, body);
        for (Element e : cut) {
            java.util.List<org.jsoup.nodes.TextNode> texts = new java.util.ArrayList<>();
            org.jsoup.select.NodeTraversor.traverse((node, depth) -> {
                if (node instanceof org.jsoup.nodes.TextNode t && !"iframe".equals(t.parent() instanceof Element p ? p.tagName() : "")) {
                    texts.add(new org.jsoup.nodes.TextNode(t.getWholeText()));
                }
            }, e);
            e.empty();
            texts.forEach(e::appendChild);
        }
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
        String v = trimSpaces(raw);
        if (v.isEmpty()) return null;
        if (!v.regionMatches(true, 0, "data:", 0, 5) && raw.length() > URL_MAX) return null;
        if (v.regionMatches(true, 0, "data:", 0, 5)) {
            var m = SRCSET_DATA_CANDIDATE.matcher(v);
            if (!m.matches() || !SAFE_URL.matcher(m.group(1)).find() || m.group(1).chars().filter(ch -> ch == ',').count() != 1) return null;
            return m.group(2) != null ? m.group(1) + " " + m.group(2) : m.group(1);
        }
        String[] cands = v.split(", +", -1);
        if (cands.length > SRCSET_MAX) return null;
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String c0 : cands) {
            var m = SRCSET_CANDIDATE.matcher(trimSpaces(c0));
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
