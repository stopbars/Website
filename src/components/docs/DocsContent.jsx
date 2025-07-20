import React from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { 
  AlertTriangle, 
  AlertOctagon,
  Info,
  Check
} from '../shared/Icons';

const AlertBlock = ({ type, children }) => {
  const configs = {
    WARNING: {
      icon: AlertTriangle,
      classes: 'bg-[#4c1d1d] border-[#f85149]',
      iconColor: 'text-[#f85149]',
      titleColor: 'text-[#f85149]',
      textColor: 'text-[#ffdcd8]'
    },
    IMPORTANT: {
      icon: AlertOctagon,
      classes: 'bg-[#371d03] border-[#d29922]',
      iconColor: 'text-[#d29922]',
      titleColor: 'text-[#d29922]',
      textColor: 'text-[#ffd8a0]'
    },
    NOTE: {
      icon: Info,
      classes: 'bg-[#1d1f21] border-[#3fb950]',
      iconColor: 'text-[#3fb950]',
      titleColor: 'text-[#3fb950]',
      textColor: 'text-[#bef5be]'
    },
    TIP: {
      icon: Check,
      classes: 'bg-[#0d1726] border-[#3b8eea]',
      iconColor: 'text-[#3b8eea]',
      titleColor: 'text-[#3b8eea]',
      textColor: 'text-[#cae8ff]'
    }
  };

  const config = configs[type] || configs.NOTE;
  const Icon = config.icon;

  return (
    <div className={`relative my-4 p-4 rounded-md border ${config.classes}`}>
      <div className="flex gap-2">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className={`font-semibold mb-2 ${config.titleColor}`}>{type}</div>
          <div className={`markdown-alert-content text-[14px] ${config.textColor}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

const parseMarkdown = (content) => {
  if (!content) return [];

  const lines = content.split('\n');
  const elements = [];
  let currentBlock = [];
  let inBlockquote = false;
  let inFigure = false;
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];
  let currentFigureBlock = [];

  const processTable = (headers, rows) => {
    return (
      <div className="overflow-x-auto mb-6 rounded-lg border border-zinc-800">
        <table className="w-full border-collapse">
          <thead className="bg-zinc-800/50">
            <tr>
              {headers.map((header, i) => (
                <th 
                  key={i}
                  className="px-4 py-3 text-left text-sm font-semibold text-white border-b border-zinc-700"
                >
                  {parseInlineMarkdown(header.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-800/30">
                {row.map((cell, j) => (
                  <td 
                    key={j}
                    className="px-4 py-3 text-sm text-zinc-300"
                  >
                    {parseInlineMarkdown(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const processBlockquote = (lines) => {
    const text = lines.join('\n').trim();
    const alertMatch = text.match(/^\[!(.*?)\](.*)/s);
    
    if (alertMatch) {
      const [, type, content] = alertMatch;
      return (
        <AlertBlock type={type.trim().toUpperCase()}>
          {parseInlineMarkdown(content.trim())}
        </AlertBlock>
      );
    }

    return (
      <blockquote className="border-l-4 border-zinc-700 pl-4 my-4 text-zinc-400">
        {parseInlineMarkdown(text)}
      </blockquote>
    );
  };

  const parseInlineMarkdown = (text) => {
    if (!text) return text;
    
    // Handle bold text
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Handle italic text
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Handle inline code
    text = text.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Handle links
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

    // Convert the HTML string to React elements
    const temp = document.createElement('div');
    temp.innerHTML = text;
    
    return Array.from(temp.childNodes).map((node, index) => {
      if (node.nodeType === 3) return node.textContent;
      const Element = node.tagName.toLowerCase();
      const props = { key: `inline-${Date.now()}-${index}` };
      
      // Add appropriate classes based on element type
      if (Element === 'strong') props.className = 'font-bold text-white';
      if (Element === 'em') props.className = 'italic text-zinc-300';
      if (Element === 'code') props.className = 'bg-zinc-800 text-emerald-400 px-1.5 py-0.5 rounded text-sm font-mono';
      if (Element === 'a') {
        props.className = 'text-emerald-400 hover:text-emerald-300 underline transition-colors';
        props.href = node.getAttribute('href');
        if (props.href?.startsWith('http')) {
          props.target = '_blank';
          props.rel = 'noopener noreferrer';
        }
      }
      
      return React.createElement(Element, props, node.textContent);
    });
  };

  const processLine = (line, index) => {
    // Table processing
    if (line.includes('|')) {
      // Header separator line
      if (line.match(/^\|?\s*[-:]+\s*\|/)) {
        return null;
      }
      
      // Table row
      const cells = line.split('|')
        .filter(cell => cell.trim() !== '')
        .map(cell => cell.trim());
  
      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      return null;
    } else if (inTable) {
      inTable = false;
      const table = processTable(tableHeaders, tableRows);
      tableHeaders = [];
      tableRows = [];
      return table;
    }

    // Headers
    const headerMatch = line.trim().match(/^(#{1,6})\s*(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      
      const Tag = `h${level}`;
      const classes = {
        h1: 'text-4xl font-bold mb-8 mt-2 text-white border-b border-zinc-800 pb-4 scroll-mt-24',
        h2: 'text-2xl font-bold mt-8 mb-4 text-white border-b border-zinc-800 pb-2 scroll-mt-24',
        h3: 'text-xl font-bold mt-6 mb-3 text-white scroll-mt-24',
        h4: 'text-lg font-bold mt-6 mb-3 text-white scroll-mt-24',
        h5: 'text-base font-bold mt-4 mb-2 text-white scroll-mt-24',
        h6: 'text-sm font-bold mt-4 mb-2 text-white uppercase tracking-wide scroll-mt-24'
      }[Tag] || 'font-bold my-2 text-white';
      
      return React.createElement(Tag, { 
        className: classes, 
        key: index,
        id: id  // Add the ID here
      }, parseInlineMarkdown(text));
    }
  
    // Break tag - Fixed implementation
    if (line.trim() === '<br>' || line.trim() === '<br/>') {
      return React.createElement('br', { key: index });
    }
  
    // Figure start
    if (line.trim() === '<figure>') {
      inFigure = true;
      currentFigureBlock = []; 
      return null;
    }
  
    // Figure end
    if (line.trim() === '</figure>') {
      inFigure = false;
      const figureContent = currentFigureBlock; 
      currentFigureBlock = []; 
      return <figure className="my-6 flex flex-col items-center" key={index}>{figureContent}</figure>;
    }
  
    // Image
    const imageMatch = line.match(/<img src="(.*?)"(.*?)>/);
    if (imageMatch) {
      const [, src, attrs] = imageMatch;
      const widthMatch = attrs.match(/width="(\d+)"/);
      const width = widthMatch ? widthMatch[1] : undefined;
      
      const imgElement = (
        <img 
          src={src.replace('../Assets/', '/docs/assets/')}
          alt=""
          className="rounded-lg border border-zinc-800 mx-auto"
          style={width ? { width: `${width}px` } : {}}
          key={index}
        />
      );
  
      if (inFigure) {
        currentFigureBlock.push(imgElement);
        return null;
      }
      return imgElement;
    }
  
    // Figcaption
    if (line.trim().startsWith('<figcaption>')) {
      const caption = line.replace(/<\/?figcaption>/g, '').trim();
      const captionElement = (
        <figcaption className="mt-2 text-sm text-zinc-400 text-center" key={`caption-${index}`}>
          {caption}
        </figcaption>
      );
      
      if (inFigure) {
        currentFigureBlock.push(captionElement);
        return null;
      }
      return captionElement;
    }
  
    // Blockquotes
    if (line.startsWith('>')) {
      if (!inBlockquote) {
        inBlockquote = true;
        currentBlock = [];
      }
      currentBlock.push(line.slice(1).trim());
      return null;
    } else if (inBlockquote && line.trim() === '') {
      inBlockquote = false;
      const blockquoteContent = processBlockquote(currentBlock);
      currentBlock = [];
      return blockquoteContent;
    }
  
    // Regular paragraph text
    if (line.trim() !== '') {
      return (
        <p className="mb-4 text-zinc-300 leading-relaxed" key={index}>
          {parseInlineMarkdown(line)}
        </p>
      );
    }
  
    return null;
  };

  // Process each line
  lines.forEach((line, index) => {
    const element = processLine(line, index);
    if (element) {
      elements.push(element);
    }
  });

  // Handle any remaining blockquote
  if (inBlockquote && currentBlock.length > 0) {
    elements.push(processBlockquote(currentBlock));
  }

  // Handle any remaining table
  if (inTable && tableHeaders.length > 0) {
    elements.push(processTable(tableHeaders, tableRows));
  }

  return elements;
};

export const DocsContent = ({ content }) => {
  const parsedContent = parseMarkdown(content);
  
  return (
    <Card className="flex-1 p-8">
      <div className="max-w-3xl mx-auto">
        {parsedContent}
      </div>
    </Card>
  );
};

DocsContent.propTypes = {
  content: PropTypes.string.isRequired
};

AlertBlock.propTypes = {
  type: PropTypes.oneOf(['WARNING', 'IMPORTANT', 'NOTE', 'TIP']).isRequired,
  children: PropTypes.node.isRequired
};
