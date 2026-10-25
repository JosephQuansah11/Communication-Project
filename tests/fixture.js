import JSZip from 'jszip';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8Dwn4EIwESMolGFlAEAiDMBA1G6R3sAAAAASUVORK5CYII=';

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const slide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B1120"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="12192000" cy="6858000"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="8229600" cy="1371600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="4400" b="1"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:latin typeface="Georgia"/></a:rPr><a:t>Imported headline</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="914400" y="2514600"/><a:ext cx="6400800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="l"/><a:r><a:rPr sz="2000"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:rPr><a:t>Native PPTX import.</a:t></a:r><a:br/><a:r><a:rPr sz="2000" i="1"/><a:t>Second line &amp; entities.</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="4" name="Picture 1"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="7772400" y="1828800"/><a:ext cx="2743200" cy="2743200"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>
      <p:grpSp>
        <p:nvGrpSpPr><p:cNvPr id="5" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
        <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="12192000" cy="6858000"/></a:xfrm></p:grpSpPr>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="6" name="Grouped pill"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
          <p:spPr><a:xfrm><a:off x="914400" y="4572000"/><a:ext cx="3048000" cy="609600"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="6366F1"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="A5B4FC"/></a:solidFill></a:ln></p:spPr>
          <p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1600" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Grouped pill</a:t></a:r></a:p></p:txBody>
        </p:sp>
      </p:grpSp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="7" name="Inherited body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1800"/><a:t>Inherited body</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst>
    <p:seq><p:cTn id="2" nodeType="mainSeq"><p:childTnLst>
      <p:par><p:cTn id="3"><p:childTnLst>
        <p:par><p:cTn id="4" presetID="10" presetClass="entr" presetSubtype="0" nodeType="clickEffect" dur="500"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par>
      </p:childTnLst></p:cTn></p:par>
      <p:par><p:cTn id="5"><p:childTnLst>
        <p:par><p:cTn id="6" presetID="2" presetClass="entr" presetSubtype="4" nodeType="clickEffect" dur="600"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:anim><p:cBhvr><p:tgtEl><p:spTgt spid="3"/></p:tgtEl></p:cBhvr></p:anim></p:childTnLst></p:cTn></p:par>
        <p:par><p:cTn id="7" presetID="23" presetClass="entr" presetSubtype="0" nodeType="withEffect" dur="800"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:animEffect transition="in" filter="fade"><p:cBhvr><p:tgtEl><p:spTgt spid="6"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>
      </p:childTnLst></p:cTn></p:par>
      <p:par><p:cTn id="8"><p:childTnLst>
        <p:par><p:cTn id="9" presetID="6" presetClass="emph" presetSubtype="0" nodeType="clickEffect" dur="1000"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:animScale><p:cBhvr><p:tgtEl><p:spTgt spid="4"/></p:tgtEl></p:cBhvr></p:animScale></p:childTnLst></p:cTn></p:par>
      </p:childTnLst></p:cTn></p:par>
      <p:par><p:cTn id="10"><p:childTnLst>
        <p:par><p:cTn id="11" presetID="1" presetClass="path" presetSubtype="0" nodeType="clickEffect" dur="900"><p:stCondLst><p:cond delay="250"/></p:stCondLst><p:childTnLst><p:animMotion origin="layout" path="M 0 0 L 0.25 0.5 E" pathEditMode="relative"><p:cBhvr><p:tgtEl><p:spTgt spid="7"/></p:tgtEl></p:cBhvr></p:animMotion></p:childTnLst></p:cTn></p:par>
      </p:childTnLst></p:cTn></p:par>
      <p:par><p:cTn id="12"><p:childTnLst>
        <p:par><p:cTn id="13" presetID="10" presetClass="exit" presetSubtype="0" nodeType="clickEffect" dur="400"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:animEffect transition="out" filter="fade"><p:cBhvr><p:tgtEl><p:spTgt spid="5"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>
      </p:childTnLst></p:cTn></p:par>
    </p:childTnLst></p:cTn></p:seq>
  </p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>
</p:sld>`;

const slide2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="12192000" cy="6858000"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Table title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="609600" y="457200"/><a:ext cx="7315200" cy="914400"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr>
        <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="3200" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>Imported table</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:graphicFrame>
        <p:nvGraphicFramePr><p:cNvPr id="3" name="Table 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
        <p:xfrm><a:off x="609600" y="1600200"/><a:ext cx="7315200" cy="1828800"/></p:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
          <a:tbl>
            <a:tblPr firstRow="1"><a:tableStyleId>style</a:tableStyleId></a:tblPr>
            <a:tblGrid><a:gridCol w="2743200"/><a:gridCol w="2286000"/><a:gridCol w="2286000"/></a:tblGrid>
            <a:tr h="457200">
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Metric</a:t></a:r></a:p></a:txBody><a:tcPr anchor="ctr"><a:solidFill><a:srgbClr val="1E293B"/></a:solidFill></a:tcPr></a:tc>
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Value</a:t></a:r></a:p></a:txBody><a:tcPr anchor="ctr"><a:solidFill><a:srgbClr val="1E293B"/></a:solidFill></a:tcPr></a:tc>
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Notes</a:t></a:r></a:p></a:txBody><a:tcPr anchor="ctr"><a:solidFill><a:srgbClr val="1E293B"/></a:solidFill></a:tcPr></a:tc>
            </a:tr>
            <a:tr h="457200">
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1600"/><a:t>Revenue</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1600"/><a:t>42000</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1600"/><a:t>Q1</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
            </a:tr>
            <a:tr h="457200">
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1600"/><a:t>Margin</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1600"/><a:t>0.62</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
              <a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1600"/><a:t>62%</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
            </a:tr>
          </a:tbl>
        </a:graphicData></a:graphic>
      </p:graphicFrame>
    </p:spTree>
  </p:cSld>
  <p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst>
    <p:seq><p:cTn id="2" nodeType="mainSeq"><p:childTnLst>
      <p:par><p:cTn id="3"><p:stCondLst><p:cond delay="1200"/></p:stCondLst><p:childTnLst>
        <p:par><p:cTn id="4" presetID="10" presetClass="entr" presetSubtype="0" nodeType="afterEffect" dur="400"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:animEffect transition="in" filter="fade"><p:cBhvr><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>
      </p:childTnLst></p:cTn></p:par>
      <p:par><p:cTn id="5"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>
        <p:par><p:cTn id="6" presetID="2" presetClass="entr" presetSubtype="1" nodeType="clickEffect" dur="500"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:anim><p:cBhvr><p:tgtEl><p:spTgt spid="3"/></p:tgtEl></p:cBhvr></p:anim></p:childTnLst></p:cTn></p:par>
      </p:childTnLst></p:cTn></p:par>
    </p:childTnLst></p:cTn></p:seq>
  </p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>
</p:sld>`;


const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test">
  <a:themeElements>
    <a:clrScheme name="Test">
      <a:dk1><a:srgbClr val="111827"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>
      <a:accent1><a:srgbClr val="FF6B00"/></a:accent1><a:accent2><a:srgbClr val="0EA5E9"/></a:accent2>
      <a:accent3><a:srgbClr val="22C55E"/></a:accent3><a:accent4><a:srgbClr val="EAB308"/></a:accent4>
      <a:accent5><a:srgbClr val="A855F7"/></a:accent5><a:accent6><a:srgbClr val="EC4899"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Test">
      <a:majorFont><a:latin typeface="Georgia"/></a:majorFont>
      <a:minorFont><a:latin typeface="Segoe UI"/></a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>`;

const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
</p:presentation>`;

const presentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`;

const slide1Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;

const slide2Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

const slideLayout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="1143000"/></a:xfrm></p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="609600" y="1600200"/><a:ext cx="8001000" cy="1000125"/></a:xfrm></p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`;

/* ------------------------------------------------------------------ *
 * Layout / master fixture
 *
 * A deck whose design lives in the slide layout and the master: a design picture
 * in the layout, a gradient master background, a theme (`bgRef`) background, and
 * a slide that points at a background picture which is not in the package.
 * ------------------------------------------------------------------ */

const layoutSlide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="914400" y="2286000"/><a:ext cx="9144000" cy="1143000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="3200"/><a:t>Design from the layout</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

const layoutSlide2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId9"/></a:blipFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sld>`;

const layoutSlide3 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:bg><p:bgRef idx="1001"><a:schemeClr val="accent1"/></p:bgRef></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sld>`;

const layoutWithDesign = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="4" name="Design band"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="1371600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="5" name="Placeholder picture"/><p:cNvPicPr/><p:nvPr><p:ph type="pic" idx="1"/></p:nvPr></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="1371600"/></a:xfrm></p:spPr>
      </p:pic>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="609600" y="1828800"/><a:ext cx="9144000" cy="914400"/></a:xfrm></p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`;

const masterWithGradient = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${NS}>
  <p:cSld>
    <p:bg><p:bgPr><a:gradFill rotWithShape="1"><a:gsLst>
      <a:gs pos="0"><a:srgbClr val="0B1120"/></a:gs>
      <a:gs pos="100000"><a:srgbClr val="4338CA"/></a:gs>
    </a:gsLst><a:lin ang="2700000" scaled="0"/></a:gradFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="9" name="Master logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="10058400" y="5029200"/><a:ext cx="1219200" cy="1219200"/></a:xfrm></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sldMaster>`;

const layoutFixturePresentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
</p:presentation>`;

const layoutFixtureRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
</Relationships>`;

const layoutSlideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

const layoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;

const masterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;

/**
 * A deck whose design lives in the layout/master: a layout design picture, a
 * gradient master background, a `bgRef` theme background and a slide pointing at
 * a background picture that is not in the package.
 */
export async function buildLayoutFixture() {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'
  );
  zip.file('ppt/presentation.xml', layoutFixturePresentation);
  zip.file('ppt/_rels/presentation.xml.rels', layoutFixtureRels);
  zip.file('ppt/theme/theme1.xml', theme);
  zip.file('ppt/slides/slide1.xml', layoutSlide1);
  zip.file('ppt/slides/slide2.xml', layoutSlide2);
  zip.file('ppt/slides/slide3.xml', layoutSlide3);
  zip.file('ppt/slides/_rels/slide1.xml.rels', layoutSlideRels);
  zip.file('ppt/slides/_rels/slide2.xml.rels', layoutSlideRels);
  zip.file('ppt/slides/_rels/slide3.xml.rels', layoutSlideRels);
  zip.file('ppt/slideLayouts/slideLayout1.xml', layoutWithDesign);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', layoutRels);
  zip.file('ppt/slideMasters/slideMaster1.xml', masterWithGradient);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', masterRels);
  zip.file('ppt/media/image1.png', Buffer.from(PNG_BASE64, 'base64'));
  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * A slide built to exercise the details a designed deck relies on: text highlight,
 * paragraph and line spacing, bullets, body insets, autofit, theme tints, a group
 * fill, a picture fill, an outline-only shape and a SmartArt diagram.
 */
const fidelitySlide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/><a:chOff x="0" y="0"/><a:chExt cx="12192000" cy="6858000"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Banner"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="1371600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody>
          <a:bodyPr anchor="ctr" lIns="45720" tIns="22860" rIns="91440" bIns="45720"/>
          <a:p>
            <a:pPr algn="ctr"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="600"/></a:spcBef><a:spcAft><a:spcPts val="1200"/></a:spcAft></a:pPr>
            <a:r><a:rPr sz="2000" b="1"><a:highlight><a:srgbClr val="7F1D1D"/></a:highlight><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Roles of the prophets</a:t></a:r>
          </a:p>
          <a:p>
            <a:pPr marL="285750" indent="-285750"><a:buChar char="&#8226;"/></a:pPr>
            <a:r><a:rPr sz="2000"/><a:t>Prophetesses</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Outlined"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="914400" y="1828800"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="25400"><a:solidFill><a:srgbClr val="B78B19"/></a:solidFill></a:ln></p:spPr>
        <p:txBody><a:bodyPr/><a:p/></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Picture fill"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="3200400" y="1828800"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></p:spPr>
        <p:txBody><a:bodyPr/><a:p/></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="5" name="Tinted"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="5486400" y="1828800"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="40000"/><a:lumOff val="60000"/></a:schemeClr></a:solidFill></p:spPr>
        <p:txBody><a:bodyPr/><a:p/></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="6" name="Shrunk"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="7772400" y="1828800"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr><a:normAutofit fontScale="80000"/></a:bodyPr><a:p><a:r><a:rPr sz="2000"/><a:t>Shrunk to fit</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:grpSp>
        <p:nvGrpSpPr><p:cNvPr id="7" name="Artwork"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
        <p:grpSpPr><a:xfrm><a:off x="914400" y="3657600"/><a:ext cx="3657600" cy="1219200"/><a:chOff x="0" y="0"/><a:chExt cx="3657600" cy="1219200"/></a:xfrm><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></p:grpSpPr>
        <p:sp>
          <p:nvSpPr><p:cNvPr id="8" name="Arrow"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
          <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="609600"/></a:xfrm><a:prstGeom prst="rightArrow"><a:avLst/></a:prstGeom><a:grpFill/><a:ln><a:noFill/></a:ln></p:spPr>
          <p:txBody><a:bodyPr/><a:p/></p:txBody>
        </p:sp>
      </p:grpSp>
      <p:graphicFrame>
        <p:nvGraphicFramePr><p:cNvPr id="9" name="Diagram"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
        <p:xfrm><a:off x="1828800" y="5029200"/><a:ext cx="4572000" cy="1371600"/></p:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rId9" r:lo="rId10" r:qs="rId11" r:cs="rId12"/></a:graphicData></a:graphic>
      </p:graphicFrame>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="10" name="Video from YouTube"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr>
            <a:videoFile r:link="rId20"/>
            <p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId21"/></p:ext></p:extLst>
          </p:nvPr>
        </p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId22"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm><a:off x="6400800" y="5029200"/><a:ext cx="4572000" cy="1371600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`;

const fidelityPresentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
</p:presentation>`;

const fidelityPresentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`;

const fidelitySlideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/>
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout" Target="../diagrams/layout1.xml"/>
  <Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle" Target="../diagrams/quickStyle1.xml"/>
  <Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors" Target="../diagrams/colors1.xml"/>
  <Relationship Id="rId20" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="https://youtu.be/CqLxtfkMILA" TargetMode="External"/>
  <Relationship Id="rId21" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="https://youtu.be/CqLxtfkMILA" TargetMode="External"/>
  <Relationship Id="rId22" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;

const fidelityDiagramData = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="1" type="doc"/></dgm:ptLst></dgm:dataModel>`;

/** The rendered SmartArt PowerPoint keeps beside the diagram data. */
const fidelityDrawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<dsp:drawing xmlns:dsp="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <dsp:spTree>
    <dsp:nvGrpSpPr><dsp:cNvPr id="1" name=""/><dsp:cNvGrpSpPr/><dsp:nvPr/></dsp:nvGrpSpPr>
    <dsp:grpSpPr/>
    <dsp:sp>
      <dsp:nvSpPr><dsp:cNvPr id="2" name="Node 1"/><dsp:cNvSpPr/></dsp:nvSpPr>
      <dsp:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="6366F1"/></a:solidFill></dsp:spPr>
      <dsp:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1400"/><a:t>First role</a:t></a:r></a:p></dsp:txBody>
    </dsp:sp>
    <dsp:sp>
      <dsp:nvSpPr><dsp:cNvPr id="3" name="Node 2"/><dsp:cNvSpPr/></dsp:nvSpPr>
      <dsp:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="22D3EE"/></a:solidFill></dsp:spPr>
      <dsp:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1400"/><a:t>Second role</a:t></a:r></a:p></dsp:txBody>
    </dsp:sp>
  </dsp:spTree>
</dsp:drawing>`;

export async function buildFidelityFixture() {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'
  );
  zip.file('ppt/presentation.xml', fidelityPresentation);
  zip.file('ppt/_rels/presentation.xml.rels', fidelityPresentationRels);
  zip.file('ppt/theme/theme1.xml', theme);
  zip.file('ppt/slides/slide1.xml', fidelitySlide);
  zip.file('ppt/slides/_rels/slide1.xml.rels', fidelitySlideRels);
  zip.file('ppt/diagrams/data1.xml', fidelityDiagramData);
  zip.file('ppt/diagrams/drawing1.xml', fidelityDrawing);
  zip.file('ppt/media/image1.png', Buffer.from(PNG_BASE64, 'base64'));
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function buildPptxFixture() {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'
  );
  zip.file('ppt/presentation.xml', presentation);
  zip.file('ppt/_rels/presentation.xml.rels', presentationRels);
  zip.file('ppt/theme/theme1.xml', theme);
  zip.file('ppt/slides/slide1.xml', slide1);
  zip.file('ppt/slides/_rels/slide1.xml.rels', slide1Rels);
  zip.file('ppt/slides/slide2.xml', slide2);
  zip.file('ppt/slides/_rels/slide2.xml.rels', slide2Rels);
  zip.file('ppt/slideLayouts/slideLayout1.xml', slideLayout);
  zip.file('ppt/media/image1.png', Buffer.from(PNG_BASE64, 'base64'));
  return zip.generateAsync({ type: 'nodebuffer' });
}

