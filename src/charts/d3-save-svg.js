const prefix = {
  svg: 'http://www.w3.org/2000/svg',
  xhtml: 'http://www.w3.org/1999/xhtml',
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xmlns: 'http://www.w3.org/2000/xmlns/',
}

function setInlineStyles(svg) {
  // add empty svg element
  const emptySvg = window.document.createElementNS(prefix.svg, 'svg')
  window.document.body.appendChild(emptySvg)
  const emptySvgDeclarationComputed = window.getComputedStyle(emptySvg)

  function traverse(obj) {
    const tree = []
    tree.push(obj)
    function visit(node) {
      if (node && node.hasChildNodes()) {
        let child = node.firstChild
        while (child) {
          if (child.nodeType === 1 && child.nodeName !== 'SCRIPT') {
            tree.push(child)
            visit(child)
          }

          child = child.nextSibling
        }
      }
    }
    visit(obj)

    return tree
  }
  function explicitlySetStyle(element) {
    const cSSStyleDeclarationComputed = window.getComputedStyle(element)
    let i
    let len
    let key
    let value
    let computedStyleStr = ''

    for (i = 0, len = cSSStyleDeclarationComputed.length; i < len; i += 1) {
      key = cSSStyleDeclarationComputed[i]
      value = cSSStyleDeclarationComputed.getPropertyValue(key)
      if (value !== emptySvgDeclarationComputed.getPropertyValue(key)) {
        // Don't set computed style of width and height. Makes SVG elmements disappear.
        if (key !== 'height' && key !== 'width') {
          computedStyleStr += `${key}:${value};`
        }
      }
    }

    element.setAttribute('style', computedStyleStr)
  }

  // hardcode computed css styles inside svg
  const allElements = traverse(svg)
  let i = allElements.length
  while (i) {
    i -= 1
    explicitlySetStyle(allElements[i])
  }

  emptySvg.parentNode.removeChild(emptySvg)
}

function d3SaveSvgPreprocess(svg) {
  svg.setAttribute('version', '1.1')

  // removing attributes so they aren't doubled up
  svg.removeAttribute('xmlns')
  svg.removeAttribute('xlink')

  // These are needed for the svg
  if (!svg.hasAttributeNS(prefix.xmlns, 'xmlns')) {
    svg.setAttributeNS(prefix.xmlns, 'xmlns', prefix.svg)
  }

  if (!svg.hasAttributeNS(prefix.xmlns, 'xmlns:xlink')) {
    svg.setAttributeNS(prefix.xmlns, 'xmlns:xlink', prefix.xlink)
  }

  setInlineStyles(svg)

  const xmls = new XMLSerializer()
  const source = xmls.serializeToString(svg)
  const doctype =
    '<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
  const rect = svg.getBoundingClientRect()
  const svgInfo = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    class: svg.getAttribute('class'),
    id: svg.getAttribute('id'),
    childElementCount: svg.childElementCount,
    source: [doctype + source],
  }

  return svgInfo
}

function download(svgInfo, filename) {
  window.URL = window.URL || window.webkitURL
  const blob = new Blob(svgInfo.source, {type: 'image/svg+xml'})
  const url = window.URL.createObjectURL(blob)
  const {body} = document
  const a = document.createElement('a')

  body.appendChild(a)
  a.setAttribute('download', `${filename}.svg`)
  a.setAttribute('href', url)
  a.style.display = 'none'
  a.click()
  a.parentNode.removeChild(a)

  setTimeout(() => window.URL.revokeObjectURL(url), 10)
}

function converterEngine(input) {
  const uInt8Array = new Uint8Array(input)
  let i = uInt8Array.length
  const biStr = []
  while (i) {
    i += 1
    biStr[i] = String.fromCharCode(uInt8Array[i])
  }

  const base64 = window.btoa(biStr.join(''))
  return base64
}

function getImageBase64(url, callback) {
  const xhr = new XMLHttpRequest(url)
  let img64
  xhr.open('GET', url, true) // url is the url of a PNG/JPG image.
  xhr.responseType = 'arraybuffer'
  xhr.callback = callback
  xhr.onload = () => {
    img64 = converterEngine(this.response) // convert BLOB to base64
    this.callback(null, img64) // callback : err, data
  }

  xhr.onerror = () => {
    callback('B64 ERROR', null)
  }

  xhr.send()
}

function isDataURL(str) {
  // const uriPattern = /^\s*data:([a-z]+\/[-a-z0-9]+(;[-a-z]+\=[-a-z]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*$/i;
  // eslint-disable-next-line no-useless-escape
  const uriPattern =
    /^\s*data:([a-z]+\/[-a-z0-9]+(;[-a-z]+\=[-a-z]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*$/i // eslint-disable-line no-useless-escape
  return !!str.match(uriPattern)
}

function getDefaultFileName(svgInfo) {
  let defaultFileName = 'untitled'
  if (svgInfo.id) {
    defaultFileName = svgInfo.id
  } else if (svgInfo.class) {
    defaultFileName = svgInfo.class
  } else if (window.document.title) {
    defaultFileName = window.document.title
      .replace(/[^a-z0-9]/gi, '-')
      .toLowerCase()
  }

  return defaultFileName
}

export function d3SaveSvg(svgElement, config) {
  if (svgElement.nodeName !== 'svg' || svgElement.nodeType !== 1) {
    throw new Error('Need an svg element input')
  }

  const conf = config || {}
  const defaultFileName = getDefaultFileName(
    d3SaveSvgPreprocess(svgElement, conf)
  )
  const filename = conf.filename || defaultFileName
  const svgInfo = d3SaveSvgPreprocess(svgElement)
  download(svgInfo, filename)
}

export function embedRasterImages(svg) {
  const images = svg.querySelectorAll('image')
  ;[].forEach.call(images, image => {
    const url = image.getAttribute('href')

    // Check if it is already a data URL
    if (!isDataURL(url)) {
      // convert to base64 image and embed.
      getImageBase64(url, (err, d) => {
        image.setAttributeNS(prefix.xlink, 'href', `data:image/png;base64,${d}`)
      })
    }
  })
}
