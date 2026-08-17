"""Minimal smoke tests — pure-logic modules only, no DB or network."""

from app.config import APP_DIR, settings


class TestConfig:
    def test_app_dir_exists(self):
        assert APP_DIR.exists()

    def test_settings_have_app_version(self):
        assert isinstance(settings.APP_VERSION, str)
        assert "." in settings.APP_VERSION


class TestLogger:
    def test_logger_initializes(self):
        from app.core.logger import get_logger
        log = get_logger("test")
        assert log is not None
        log.info("test message")
