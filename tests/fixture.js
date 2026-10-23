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

