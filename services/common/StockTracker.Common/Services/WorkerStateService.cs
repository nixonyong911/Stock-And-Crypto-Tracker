namespace StockTracker.Common.Services;

/// <summary>
/// Service to manage worker state and enable external control.
/// This service is shared across all workers.
/// </summary>
public class WorkerStateService
{
    private readonly object _lock = new();
    private bool _isPaused;
    private bool _isRunning;
    private bool _triggerRequested;
    private DateTime? _lastOperationTime;
    private DateTime? _nextOperationTime;
    private string _currentStatus = "Idle";
    private string? _currentOperation;
    private int _totalOperationsToday;
    private int _totalErrorsToday;
    private DateTime _statsResetDate = DateTime.UtcNow.Date;

    public bool IsPaused
    {
        get { lock (_lock) return _isPaused; }
    }

    public bool IsRunning
    {
        get { lock (_lock) return _isRunning; }
    }

    public bool TriggerRequested
    {
        get { lock (_lock) return _triggerRequested; }
    }

    public WorkerStatus GetStatus()
    {
        lock (_lock)
        {
            // Reset daily stats if new day
            if (DateTime.UtcNow.Date > _statsResetDate)
            {
                _totalOperationsToday = 0;
                _totalErrorsToday = 0;
                _statsResetDate = DateTime.UtcNow.Date;
            }

            return new WorkerStatus
            {
                IsRunning = _isRunning,
                IsPaused = _isPaused,
                CurrentStatus = _currentStatus,
                CurrentOperation = _currentOperation,
                LastOperationTime = _lastOperationTime,
                NextOperationTime = _nextOperationTime,
                TotalOperationsToday = _totalOperationsToday,
                TotalErrorsToday = _totalErrorsToday
            };
        }
    }

    public void SetPaused(bool paused)
    {
        lock (_lock)
        {
            _isPaused = paused;
            _currentStatus = paused ? "Paused" : "Idle";
        }
    }

    public void SetRunning(bool running)
    {
        lock (_lock)
        {
            _isRunning = running;
        }
    }

    public void RequestTrigger()
    {
        lock (_lock)
        {
            _triggerRequested = true;
        }
    }

    public bool ConsumeTrigger()
    {
        lock (_lock)
        {
            if (_triggerRequested)
            {
                _triggerRequested = false;
                return true;
            }
            return false;
        }
    }

    public void SetCurrentOperation(string operation)
    {
        lock (_lock)
        {
            _currentStatus = "Working";
            _currentOperation = operation;
        }
    }

    public void SetOperationCompleted()
    {
        lock (_lock)
        {
            _currentStatus = _isPaused ? "Paused" : "Idle";
            _currentOperation = null;
            _lastOperationTime = DateTime.UtcNow;
            _totalOperationsToday++;
        }
    }

    public void SetOperationError()
    {
        lock (_lock)
        {
            _totalErrorsToday++;
        }
    }

    public void SetNextOperationTime(DateTime? nextTime)
    {
        lock (_lock)
        {
            _nextOperationTime = nextTime;
        }
    }
}

/// <summary>
/// Status of a worker
/// </summary>
public class WorkerStatus
{
    public bool IsRunning { get; set; }
    public bool IsPaused { get; set; }
    public string CurrentStatus { get; set; } = "Unknown";
    public string? CurrentOperation { get; set; }
    public DateTime? LastOperationTime { get; set; }
    public DateTime? NextOperationTime { get; set; }
    public int TotalOperationsToday { get; set; }
    public int TotalErrorsToday { get; set; }
}





































