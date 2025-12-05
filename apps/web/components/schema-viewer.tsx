'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Hash, Type, Calendar, Link2, Mail, CheckSquare, List, Braces, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SchemaField, InferredSchema } from '@/lib/api';

interface SchemaFieldRowProps {
  field: SchemaField;
  depth?: number;
  defaultExpanded?: boolean;
}

function getTypeIcon(type: string) {
  const baseType = type.split(':')[0].split('|')[0].split(' ')[0];

  switch (baseType) {
    case 'string':
      if (type.includes('datetime')) return <Calendar className="h-3.5 w-3.5 text-orange-500" />;
      if (type.includes('date')) return <Calendar className="h-3.5 w-3.5 text-orange-400" />;
      if (type.includes('uuid')) return <Hash className="h-3.5 w-3.5 text-purple-500" />;
      if (type.includes('email')) return <Mail className="h-3.5 w-3.5 text-blue-500" />;
      if (type.includes('uri')) return <Link2 className="h-3.5 w-3.5 text-blue-400" />;
      return <Type className="h-3.5 w-3.5 text-green-500" />;
    case 'integer':
    case 'number':
      return <Hash className="h-3.5 w-3.5 text-blue-500" />;
    case 'boolean':
      return <CheckSquare className="h-3.5 w-3.5 text-purple-500" />;
    case 'array':
      return <List className="h-3.5 w-3.5 text-yellow-500" />;
    case 'object':
      return <Braces className="h-3.5 w-3.5 text-cyan-500" />;
    default:
      return <AlertCircle className="h-3.5 w-3.5 text-gray-400" />;
  }
}

function formatType(type: string): string {
  return type
    .replace('string:datetime', 'datetime')
    .replace('string:date', 'date')
    .replace('string:uuid', 'uuid')
    .replace('string:email', 'email')
    .replace('string:uri', 'uri');
}

function SchemaFieldRow({ field, depth = 0, defaultExpanded = true }: SchemaFieldRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = field.children && field.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors',
          depth > 0 && 'ml-4'
        )}
        onClick={() => hasChildren && setExpanded(!expanded)}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button className="p-0.5 hover:bg-muted rounded">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {getTypeIcon(field.type)}

        <span className="font-mono text-sm font-medium">
          {field.name === '[]' ? '[items]' : field.name}
        </span>

        {!field.required && (
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 text-muted-foreground">
            optional
          </Badge>
        )}

        {field.nullable && (
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 text-yellow-600 border-yellow-300">
            nullable
          </Badge>
        )}

        <span className="text-xs text-muted-foreground ml-auto font-mono">
          {formatType(field.type)}
        </span>

        {field.enum && field.enum.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4 cursor-help">
                  enum({field.enum.length})
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-xs font-mono">
                  {field.enum.slice(0, 5).map(v => JSON.stringify(v)).join(', ')}
                  {field.enum.length > 5 && '...'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Field details */}
      {expanded && (
        <div
          className="text-xs text-muted-foreground py-1 flex gap-4 items-center"
          style={{ paddingLeft: `${depth * 16 + 48}px` }}
        >
          {field.minLength !== undefined && field.maxLength !== undefined && (
            <span>
              length: {field.minLength === field.maxLength ? field.minLength : `${field.minLength}-${field.maxLength}`}
            </span>
          )}
          {field.minimum !== undefined && field.maximum !== undefined && (
            <span>
              range: {field.minimum === field.maximum ? field.minimum : `${field.minimum} - ${field.maximum}`}
            </span>
          )}
          {field.examples && field.examples.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted">
                    {field.examples.length} example{field.examples.length !== 1 ? 's' : ''}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-md">
                  <div className="text-xs font-mono space-y-1">
                    {field.examples.map((ex, i) => (
                      <div key={i} className="truncate max-w-[300px]">
                        {JSON.stringify(ex)}
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {field.children!.map((child, index) => (
            <SchemaFieldRow key={`${child.name}-${index}`} field={child} depth={depth + 1} defaultExpanded={depth < 2} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SchemaViewerProps {
  schema: InferredSchema | null;
  loading?: boolean;
  error?: Error | null;
  className?: string;
}

export function SchemaViewer({ schema, loading, error, className }: SchemaViewerProps) {
  if (loading) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        <div className="animate-pulse">Analyzing message schema...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 text-center text-destructive', className)}>
        <AlertCircle className="h-5 w-5 mx-auto mb-2" />
        <p className="text-sm">Failed to analyze schema: {error.message}</p>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        No schema data available
      </div>
    );
  }

  if (schema.sampleCount === 0) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        <p className="text-sm">No messages to analyze</p>
        <p className="text-xs mt-1">Publish some messages to infer the schema</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Schema summary */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pb-2 border-b">
        <span>
          <strong className="text-foreground">{schema.sampleCount}</strong> messages sampled
        </span>
        {schema.parseErrors > 0 && (
          <span className="text-yellow-600">
            <strong>{schema.parseErrors}</strong> parse errors
          </span>
        )}
        <span>
          Format: <strong className="text-foreground">{schema.format || 'unknown'}</strong>
        </span>
        <span>
          Root type: <strong className="text-foreground">{schema.type}</strong>
        </span>
      </div>

      {/* Schema tree */}
      <div className="rounded-md border bg-card">
        {schema.fields.length > 0 ? (
          <div className="p-2">
            {schema.fields.map((field, index) => (
              <SchemaFieldRow key={`${field.name}-${index}`} field={field} defaultExpanded />
            ))}
          </div>
        ) : (
          <div className="p-4 text-center text-muted-foreground text-sm">
            {schema.type === 'primitive' ? (
              <p>Messages contain primitive values (non-structured data)</p>
            ) : (
              <p>No fields detected in message structure</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
