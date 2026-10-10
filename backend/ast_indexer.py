"""
Codebase AST & Symbol Graph Indexer for Castor AI (Phase 7).
Provides high-speed semantic repository navigation and symbol indexing for:
- Python (via native ast parser)
- JavaScript / TypeScript (classes, functions, arrow functions, interfaces, types)
- C# / Unity (classes, structs, interfaces, methods, MonoBehaviours)
- Rust & Go (functions, structs, traits, methods)

Allows instant definition lookups, symbol search, and file outlines without
flooding LLM context windows with brute-force grep or raw file dumps.
"""

import os
import re
import ast
import time
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any, Set, Tuple

# Common directories to exclude from indexing
EXCLUDED_DIRS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".idea",
    ".vscode",
    "bin",
    "obj",
    "Library",
    "Temp",
    "Logs",
    "Packages",
    ".castor",
    "target",
}

# Supported file extensions mapped to languages
EXTENSION_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".cs": "csharp",
    ".go": "go",
    ".rs": "rust",
}


@dataclass
class SymbolDefinition:
    name: str
    kind: str  # "class", "function", "method", "interface", "type", "struct", "enum"
    file_path: str  # Relative path to project root
    abs_path: str
    line_start: int
    line_end: int
    signature: str
    docstring: Optional[str] = None
    container: Optional[str] = None  # Parent class/interface/namespace
    language: str = "python"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PythonAstParser:
    """Parses Python source files using standard library AST."""

    @staticmethod
    def parse_file(content: str, rel_path: str, abs_path: str) -> List[SymbolDefinition]:
        symbols: List[SymbolDefinition] = []
        try:
            tree = ast.parse(content, filename=rel_path)
        except Exception:
            # Fall back to regex parser if syntax error or incomplete file
            return RegexFallbackParser.parse_file(content, rel_path, abs_path, "python")

        lines = content.splitlines()

        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                doc = ast.get_docstring(node)
                class_sig = f"class {node.name}"
                if node.bases:
                    bases = [ast.unparse(b) for b in node.bases]
                    class_sig += f"({', '.join(bases)})"

                symbols.append(
                    SymbolDefinition(
                        name=node.name,
                        kind="class",
                        file_path=rel_path,
                        abs_path=abs_path,
                        line_start=node.lineno,
                        line_end=getattr(node, "end_lineno", node.lineno),
                        signature=class_sig,
                        docstring=doc,
                        container=None,
                        language="python",
                    )
                )

                # Parse methods inside the class
                for child in node.body:
                    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        method_doc = ast.get_docstring(child)
                        is_async = isinstance(child, ast.AsyncFunctionDef)
                        prefix = "async def " if is_async else "def "
                        sig_args = [a.arg for a in child.args.args]
                        sig = f"{prefix}{child.name}({', '.join(sig_args)})"

                        symbols.append(
                            SymbolDefinition(
                                name=child.name,
                                kind="method",
                                file_path=rel_path,
                                abs_path=abs_path,
                                line_start=child.lineno,
                                line_end=getattr(child, "end_lineno", child.lineno),
                                signature=sig,
                                docstring=method_doc,
                                container=node.name,
                                language="python",
                            )
                        )

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                fn_doc = ast.get_docstring(node)
                is_async = isinstance(node, ast.AsyncFunctionDef)
                prefix = "async def " if is_async else "def "
                sig_args = [a.arg for a in node.args.args]
                sig = f"{prefix}{node.name}({', '.join(sig_args)})"

                symbols.append(
                    SymbolDefinition(
                        name=node.name,
                        kind="function",
                        file_path=rel_path,
                        abs_path=abs_path,
                        line_start=node.lineno,
                        line_end=getattr(node, "end_lineno", node.lineno),
                        signature=sig,
                        docstring=fn_doc,
                        container=None,
                        language="python",
                    )
                )

        return symbols


class RegexFallbackParser:
    """Robust regex-based symbol extractor for JS/TS, C#, Go, Rust, and Python fallbacks."""

    RE_JS_CLASS = re.compile(r"^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_$]+)(?:\s+extends\s+([A-Za-z0-9_$]+))?", re.MULTILINE)
    RE_JS_FUNC = re.compile(r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)", re.MULTILINE)
    RE_JS_ARROW = re.compile(r"^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z0-9_$]+))\s*=>", re.MULTILINE)
    RE_JS_INTERFACE = re.compile(r"^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)", re.MULTILINE)
    RE_JS_TYPE = re.compile(r"^(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=", re.MULTILINE)

    # C# patterns
    RE_CS_CLASS = re.compile(r"^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:partial\s+)?(?:class|struct|interface|enum)\s+([A-Za-z0-9_]+)", re.MULTILINE)
    RE_CS_METHOD = re.compile(r"^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:virtual\s+|override\s+|async\s+)?([A-Za-z0-9_<>\[\],\s]+)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*(?:\{|=>)", re.MULTILINE)

    # Go & Rust patterns
    RE_GO_FUNC = re.compile(r"^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(", re.MULTILINE)
    RE_GO_TYPE = re.compile(r"^type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)", re.MULTILINE)
    RE_RS_FN = re.compile(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)\s*\(", re.MULTILINE)
    RE_RS_STRUCT = re.compile(r"^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z0-9_]+)", re.MULTILINE)

    @classmethod
    def parse_file(cls, content: str, rel_path: str, abs_path: str, lang: str) -> List[SymbolDefinition]:
        symbols: List[SymbolDefinition] = []
        lines = content.splitlines()

        if lang in ["javascript", "typescript"]:
            for idx, line in enumerate(lines, start=1):
                m_class = cls.RE_JS_CLASS.search(line)
                if m_class:
                    symbols.append(
                        SymbolDefinition(
                            name=m_class.group(1),
                            kind="class",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=f"class {m_class.group(1)}",
                            language=lang,
                        )
                    )
                    continue

                m_fn = cls.RE_JS_FUNC.search(line)
                if m_fn:
                    symbols.append(
                        SymbolDefinition(
                            name=m_fn.group(1),
                            kind="function",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=f"function {m_fn.group(1)}({m_fn.group(2).strip()})",
                            language=lang,
                        )
                    )
                    continue

                m_arrow = cls.RE_JS_ARROW.search(line)
                if m_arrow:
                    args = m_arrow.group(2) or m_arrow.group(3) or ""
                    symbols.append(
                        SymbolDefinition(
                            name=m_arrow.group(1),
                            kind="function",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=f"const {m_arrow.group(1)} = ({args.strip()}) =>",
                            language=lang,
                        )
                    )
                    continue

                m_iface = cls.RE_JS_INTERFACE.search(line)
                if m_iface:
                    symbols.append(
                        SymbolDefinition(
                            name=m_iface.group(1),
                            kind="interface",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=f"interface {m_iface.group(1)}",
                            language=lang,
                        )
                    )
                    continue

                m_type = cls.RE_JS_TYPE.search(line)
                if m_type:
                    symbols.append(
                        SymbolDefinition(
                            name=m_type.group(1),
                            kind="type",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=f"type {m_type.group(1)}",
                            language=lang,
                        )
                    )

        elif lang == "csharp":
            current_class = None
            for idx, line in enumerate(lines, start=1):
                m_class = cls.RE_CS_CLASS.search(line)
                if m_class:
                    cname = m_class.group(1)
                    current_class = cname
                    symbols.append(
                        SymbolDefinition(
                            name=cname,
                            kind="class",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=line.strip().rstrip("{;"),
                            language="csharp",
                        )
                    )
                    continue

                m_mth = cls.RE_CS_METHOD.search(line)
                if m_mth:
                    ret_type = m_mth.group(1).strip()
                    mname = m_mth.group(2)
                    args = m_mth.group(3).strip()
                    if mname not in ["if", "while", "for", "switch", "catch", "using"]:
                        symbols.append(
                            SymbolDefinition(
                                name=mname,
                                kind="method" if current_class else "function",
                                file_path=rel_path,
                                abs_path=abs_path,
                                line_start=idx,
                                line_end=idx,
                                signature=f"{ret_type} {mname}({args})",
                                container=current_class,
                                language="csharp",
                            )
                        )

        elif lang == "go":
            for idx, line in enumerate(lines, start=1):
                m_fn = cls.RE_GO_FUNC.search(line)
                if m_fn:
                    symbols.append(
                        SymbolDefinition(
                            name=m_fn.group(1),
                            kind="function",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=line.strip().rstrip("{"),
                            language="go",
                        )
                    )
                m_type = cls.RE_GO_TYPE.search(line)
                if m_type:
                    symbols.append(
                        SymbolDefinition(
                            name=m_type.group(1),
                            kind="struct",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=line.strip(),
                            language="go",
                        )
                    )

        elif lang == "rust":
            for idx, line in enumerate(lines, start=1):
                m_fn = cls.RE_RS_FN.search(line)
                if m_fn:
                    symbols.append(
                        SymbolDefinition(
                            name=m_fn.group(1),
                            kind="function",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=line.strip().rstrip("{"),
                            language="rust",
                        )
                    )
                m_struct = cls.RE_RS_STRUCT.search(line)
                if m_struct:
                    symbols.append(
                        SymbolDefinition(
                            name=m_struct.group(1),
                            kind="struct",
                            file_path=rel_path,
                            abs_path=abs_path,
                            line_start=idx,
                            line_end=idx,
                            signature=line.strip().rstrip("{;"),
                            language="rust",
                        )
                    )

        return symbols


class AstIndexer:
    """Singleton in-memory Codebase AST and Symbol Graph Indexer."""

    _instance: Optional["AstIndexer"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AstIndexer, cls).__new__(cls)
            cls._instance.project_path: Optional[str] = None
            cls._instance.symbols: List[SymbolDefinition] = []
            cls._instance.symbols_by_name: Dict[str, List[SymbolDefinition]] = {}
            cls._instance.symbols_by_file: Dict[str, List[SymbolDefinition]] = {}
            cls._instance.file_mtimes: Dict[str, float] = {}
            cls._instance.last_indexed: float = 0.0
            cls._instance.is_indexing: bool = False
        return cls._instance

    def index_workspace(self, project_path: str, force: bool = False) -> Dict[str, Any]:
        """Indexes all code files in the workspace incrementally."""
        if not project_path or not os.path.exists(project_path):
            return {"indexed_files": 0, "total_symbols": 0, "status": "Project path does not exist"}

        self.project_path = os.path.abspath(project_path)
        self.is_indexing = True
        start_time = time.time()

        if force:
            self.symbols.clear()
            self.symbols_by_name.clear()
            self.symbols_by_file.clear()
            self.file_mtimes.clear()

        indexed_count = 0
        new_symbols_count = 0

        for root, dirs, files in os.walk(self.project_path):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith(".")]

            for file in files:
                ext = os.path.splitext(file)[1].lower()
                lang = EXTENSION_MAP.get(ext)
                if not lang:
                    continue

                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, self.project_path).replace("\\", "/")

                try:
                    mtime = os.path.getmtime(abs_path)
                except OSError:
                    continue

                # Skip unchanged files unless forced
                if not force and self.file_mtimes.get(rel_path) == mtime:
                    continue

                self.file_mtimes[rel_path] = mtime
                indexed_count += 1

                try:
                    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()

                    if lang == "python":
                        parsed_symbols = PythonAstParser.parse_file(content, rel_path, abs_path)
                    else:
                        parsed_symbols = RegexFallbackParser.parse_file(content, rel_path, abs_path, lang)

                    # Remove old symbols for this file
                    old_symbols = self.symbols_by_file.get(rel_path, [])
                    for s in old_symbols:
                        if s.name in self.symbols_by_name:
                            self.symbols_by_name[s.name] = [
                                x for x in self.symbols_by_name[s.name] if x.file_path != rel_path
                            ]

                    self.symbols_by_file[rel_path] = parsed_symbols
                    new_symbols_count += len(parsed_symbols)

                    for s in parsed_symbols:
                        if s.name not in self.symbols_by_name:
                            self.symbols_by_name[s.name] = []
                        self.symbols_by_name[s.name].append(s)

                except Exception as e:
                    print(f"[AstIndexer] Error indexing {rel_path}: {e}")

        # Flatten total symbols list
        all_syms: List[SymbolDefinition] = []
        for file_syms in self.symbols_by_file.values():
            all_syms.extend(file_syms)
        self.symbols = all_syms
        self.last_indexed = time.time()
        self.is_indexing = False
        duration = round(time.time() - start_time, 3)

        return {
            "indexed_files": indexed_count,
            "total_files": len(self.symbols_by_file),
            "total_symbols": len(self.symbols),
            "duration_seconds": duration,
            "status": "ready",
        }

    def find_symbol(self, query: str, kind: Optional[str] = None) -> List[SymbolDefinition]:
        """Searches symbols matching name (exact or substring)."""
        q = query.strip().lower()
        if not q:
            return []

        results: List[SymbolDefinition] = []
        # Exact match priority
        for name, syms in self.symbols_by_name.items():
            if name.lower() == q:
                for s in syms:
                    if not kind or s.kind.lower() == kind.lower():
                        results.append(s)

        # Fuzzy / substring match
        for s in self.symbols:
            if q in s.name.lower() and s not in results:
                if not kind or s.kind.lower() == kind.lower():
                    results.append(s)
            if len(results) >= 50:
                break

        return results

    def get_symbol_definition(self, symbol_name: str) -> Optional[SymbolDefinition]:
        """Returns the primary definition for a given symbol name."""
        syms = self.symbols_by_name.get(symbol_name.strip())
        return syms[0] if syms else None

    def list_file_symbols(self, file_path: str) -> List[SymbolDefinition]:
        """Returns all symbols located in a specific file."""
        norm_path = file_path.replace("\\", "/").strip()
        # Try direct match or ending with
        for path, syms in self.symbols_by_file.items():
            if path == norm_path or path.endswith(norm_path) or norm_path.endswith(path):
                return syms
        return []

    def get_file_outline(self, file_path: str) -> str:
        """Returns a compact textual outline of classes, functions, and methods in a file."""
        syms = self.list_file_symbols(file_path)
        if not syms:
            return f"No symbols found in '{file_path}'. (Ensure file exists and has recognized extension)"

        lines = [f"Outline of {file_path}:"]
        for s in syms:
            indent = "  • " if not s.container else "    - "
            container_str = f"[{s.container}] " if s.container else ""
            lines.append(f"{indent}[L{s.line_start}-L{s.line_end}] {s.kind.upper()}: {container_str}{s.signature}")
        return "\n".join(lines)


# Global singleton indexer
ast_indexer = AstIndexer()
