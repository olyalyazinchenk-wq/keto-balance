import ast
import unittest
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

class TestImportSafety(unittest.TestCase):
    def test_no_top_level_init_db_in_database_py(self):
        """AST check: bot/database.py must not call init_db() at top level."""
        db_file = ROOT / "bot" / "database.py"
        source = db_file.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(db_file))
        
        top_level_calls = []
        for node in tree.body:
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                func = node.value.func
                if isinstance(func, ast.Name):
                    top_level_calls.append(func.id)
                    
        self.assertNotIn(
            "init_db",
            top_level_calls,
            "bot/database.py must not execute init_db() at module import level!"
        )

    def test_import_with_keto_load_dotenv_zero_does_not_require_env(self):
        """When KETO_LOAD_DOTENV=0, importing bot.config respects the flag."""
        env_copy = os.environ.copy()
        env_copy["KETO_LOAD_DOTENV"] = "0"
        env_copy.pop("PYTHONPATH", None)
        
        import subprocess
        code = (
            "import os, sys; "
            "assert os.getenv('KETO_LOAD_DOTENV') == '0'; "
            "import bot.config as c; "
            "assert hasattr(c, 'BOT_TOKEN'); "
            "print('CONFIG_LOADED')"
        )
        res = subprocess.run(
            [sys.executable, "-B", "-c", code],
            cwd=str(ROOT),
            env=env_copy,
            capture_output=True,
            text=True
        )
        self.assertEqual(res.returncode, 0, f"Import failed with: {res.stderr}")
        self.assertIn("CONFIG_LOADED", res.stdout)

    def test_strict_import_safety_in_fresh_process(self):
        """Subprocess strictly records and forbids .env reads, SQLite connections, and network sockets during import."""
        env_copy = os.environ.copy()
        env_copy["KETO_LOAD_DOTENV"] = "0"
        env_copy.pop("PYTHONPATH", None)
        
        import subprocess
        code = (
            "import sys, os, sqlite3, socket, builtins\n"
            "forbidden_attempts = []\n"
            "orig_connect = sqlite3.connect\n"
            "def forbidden_connect(*args, **kwargs):\n"
            "    forbidden_attempts.append(('sqlite3.connect', args, kwargs))\n"
            "    raise RuntimeError(f'FORBIDDEN_SQLITE_CONNECT: {args}')\n"
            "sqlite3.connect = forbidden_connect\n"
            "orig_open = builtins.open\n"
            "def guarded_open(file, *args, **kwargs):\n"
            "    f_str = str(file)\n"
            "    f_norm = f_str.replace('\\\\', '/')\n"
            "    if f_norm.endswith('.env') or '.env.' in f_norm or '/.env' in f_norm:\n"
            "        forbidden_attempts.append(('open_env', f_str))\n"
            "        raise PermissionError(f'FORBIDDEN_ENV_READ: {f_str}')\n"
            "    return orig_open(file, *args, **kwargs)\n"
            "builtins.open = guarded_open\n"
            "def forbidden_socket(*args, **kwargs):\n"
            "    forbidden_attempts.append(('socket.connect', args, kwargs))\n"
            "    raise RuntimeError('FORBIDDEN_NETWORK_CONNECT')\n"
            "socket.socket.connect = forbidden_socket\n"
            "modules_to_test = ['bot.config', 'bot.database', 'bot.payments', 'bot.server', 'bot.bot']\n"
            "import_errors = []\n"
            "for mod in modules_to_test:\n"
            "    try:\n"
            "        __import__(mod)\n"
            "    except Exception as exc:\n"
            "        import_errors.append((mod, str(exc)))\n"
            "if forbidden_attempts:\n"
            "    print(f'FORBIDDEN_ATTEMPTS: {forbidden_attempts}', file=sys.stderr)\n"
            "    sys.exit(2)\n"
            "if import_errors:\n"
            "    print(f'IMPORT_ERRORS: {import_errors}', file=sys.stderr)\n"
            "    sys.exit(1)\n"
            "print('STRICT_IMPORT_OK')\n"
        )
        res = subprocess.run(
            [sys.executable, "-B", "-c", code],
            cwd=str(ROOT),
            env=env_copy,
            capture_output=True,
            text=True
        )
        self.assertEqual(res.returncode, 0, f"Strict import check failed: rc={res.returncode}\nStdout: {res.stdout}\nStderr: {res.stderr}")
        self.assertIn("STRICT_IMPORT_OK", res.stdout)

if __name__ == '__main__':
    unittest.main()
