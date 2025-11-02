import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ChevronRight } from 'lucide-react';

export const Breadcrumb = ({ children }) => {
  const items = Array.isArray(children) ? children : [children];
  const totalItems = items.length;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center mt-2">
      <ol className="flex items-center gap-2">
        {items.map((child, index) => {
          const isLast = index === totalItems - 1;

          return (
            <li key={index} className="flex items-center gap-2">
              {child && typeof child === 'object'
                ? { ...child, props: { ...child.props, isActive: isLast } }
                : child}

              {!isLast && (
                <ChevronRight className="h-[17px] w-[17px] text-zinc-400" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

Breadcrumb.propTypes = {
  children: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.node), PropTypes.node]).isRequired,
};

export const BreadcrumbItem = ({ title, link, isActive = false }) => {
  const baseClasses = 'text-[15px] transition-colors';

  // Active (current page): always show the hover state from Footer (white text)
  const activeClasses = 'text-white';

  // Inactive (previous pages): use Footer's default state (zinc-400) and hover to white
  const inactiveClasses = 'text-zinc-400 hover:text-white';

  const classes = `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;

  if (!link || isActive) {
    return (
      <span className={classes} aria-current={isActive ? 'page' : undefined}>
        {title}
      </span>
    );
  }

  return (
    <Link to={link} className={classes}>
      {title}
    </Link>
  );
};

BreadcrumbItem.propTypes = {
  title: PropTypes.string.isRequired,
  link: PropTypes.string,
  isActive: PropTypes.bool,
};

export default Breadcrumb;
