using System.Windows;

namespace RepairCategories
{
    public partial class RepairCategoriesWindow : Window
    {
        private readonly RepairCategoriesViewModel _vm;

        public RepairCategoriesWindow(IRepairsRepository repo)
        {
            InitializeComponent();
            _vm = new RepairCategoriesViewModel(repo);
            this.DataContext = _vm;
            Loaded += async (_, __) => await _vm.LoadAsync();
        }

        // parameterless constructor for using in-memory repo during development
        public RepairCategoriesWindow() : this(new InMemoryRepairsRepository()) { }

        private void SearchBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == System.Windows.Input.Key.Enter)
            {
                if (_vm.FindCommand.CanExecute(null)) _vm.FindCommand.Execute(null);
                e.Handled = true;
            }
            else if (e.Key == System.Windows.Input.Key.Escape)
            {
                if (_vm.CancelCommand.CanExecute(null)) _vm.CancelCommand.Execute(null);
                e.Handled = true;
            }
        }
    }
}
